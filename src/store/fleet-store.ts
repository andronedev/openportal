import i18n from "@/i18n";
import {
	type ActiveConnection,
	type TransportKind,
	getPairedDevices,
	requestDevice,
	connectUsb as transportConnectUsb,
	connectWireless as transportConnectWireless,
} from "@/lib/adb/connection";
import { getDeviceInfo } from "@/lib/adb/device-info";
import type { ConnectionState, DeviceInfo } from "@/lib/adb/types";
import type { WirelessEndpoint } from "@/lib/adb/wireless";
import { detectBridge } from "@/lib/adb/ws-connection";
import { type PortalModelInfo, resolveModel } from "@/lib/device/models";
import type { Adb } from "@yume-chan/adb";
import type { AdbDaemonWebUsbDevice } from "@yume-chan/adb-daemon-webusb";
import { toast } from "sonner";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "./app-store";
import { useWirelessStore } from "./wireless-store";

export type { TransportKind };

export interface DeviceConnection {
	serial: string;
	kind: TransportKind;
	name: string | undefined;
	adb: Adb | null;
	state: ConnectionState;
	error: string | null;
	deviceInfo: DeviceInfo | null;
	portalModel: PortalModelInfo | null;
}

interface FleetState {
	connections: Record<string, DeviceConnection>;
	order: string[];
	activeSerial: string | null;
	connecting: boolean;
	connectError: string | null;
	selected: Record<string, true>;
	busySerials: Record<string, true>;
}

interface FleetActions {
	connectUsb: (preselected?: AdbDaemonWebUsbDevice) => Promise<string | null>;
	connectWireless: (endpoint: WirelessEndpoint) => Promise<string | null>;
	reconnectFleet: () => Promise<void>;
	setActive: (serial: string) => void;
	disconnect: (serial?: string) => Promise<void>;
	disconnectAll: () => Promise<void>;
	refreshDeviceInfo: (serial?: string) => Promise<void>;
	toggleSelected: (serial: string) => void;
	clearSelected: () => void;
	markBusy: (serial: string, abort: () => void) => void;
	clearBusy: (serial: string) => void;
	seedDemoDevices: (infos: DeviceInfo[]) => void;
}

type FleetStore = FleetState & FleetActions;

interface ConnectionResources {
	close: () => Promise<void>;
	unwatch: () => void;
}

const registry = new Map<string, ConnectionResources>();
const provisionAborters = new Map<string, () => void>();

const initialState: FleetState = {
	connections: {},
	order: [],
	activeSerial: null,
	connecting: false,
	connectError: null,
	selected: {},
	busySerials: {},
};

export const useFleetStore = create<FleetStore>((set, get) => {
	function removeConnection(
		serial: string,
		opts: { closeTransport: boolean; toastLost?: boolean },
	) {
		const res = registry.get(serial);
		res?.unwatch();
		if (opts.closeTransport) res?.close().catch(() => {});
		registry.delete(serial);
		provisionAborters.get(serial)?.();
		provisionAborters.delete(serial);

		const state = get();
		if (!state.connections[serial]) return;

		const removedIdx = state.order.indexOf(serial);
		const { [serial]: _gone, ...connections } = state.connections;
		const order = state.order.filter((x) => x !== serial);
		let activeSerial = state.activeSerial;
		if (activeSerial === serial) {
			activeSerial =
				order.length === 0
					? null
					: (order[Math.min(removedIdx, order.length - 1)] ?? null);
		}
		const { [serial]: _sel, ...selected } = state.selected;
		const { [serial]: _busy, ...busySerials } = state.busySerials;
		set({ connections, order, activeSerial, selected, busySerials });

		if (opts.toastLost) toast.warning(i18n.t("deviceLost"));
		useAppStore.getState().dropDevice(serial);
	}

	function handleLost(serial: string, expectedAdb: Adb | null) {
		const conn = get().connections[serial];
		if (!conn || conn.adb !== expectedAdb) return;
		removeConnection(serial, { closeTransport: false, toastLost: true });
	}

	const finalize = async (active: ActiveConnection): Promise<string> => {
		const { serial } = active;
		const existing = get().connections[serial];
		if (existing?.adb) {
			await active.close().catch(() => {});
			set({ activeSerial: serial });
			toast.info(
				i18n.t("fleet.alreadyConnected", { name: active.name ?? serial }),
			);
			return serial;
		}

		const unwatch = active.watchDisconnect(() =>
			handleLost(serial, active.adb),
		);
		registry.set(serial, { close: active.close, unwatch });

		set((s) => ({
			connections: {
				...s.connections,
				[serial]: {
					serial,
					kind: active.kind,
					name: active.name,
					adb: active.adb,
					state: "connected",
					error: null,
					deviceInfo: null,
					portalModel: null,
				},
			},
			order: s.order.includes(serial) ? s.order : [...s.order, serial],
			activeSerial: serial,
		}));

		await get().refreshDeviceInfo(serial);
		toast.success(i18n.t("deviceConnected", { name: active.name ?? serial }));
		return serial;
	};

	const runConnect = async (
		produce: () => Promise<ActiveConnection | null>,
	): Promise<string | null> => {
		try {
			set({ connecting: true, connectError: null });
			const active = await produce();
			if (!active) {
				set({ connecting: false });
				return null;
			}
			const serial = await finalize(active);
			set({ connecting: false });
			return serial;
		} catch (err) {
			const message =
				err instanceof Error ? err.message : i18n.t("connectionFailed");
			set({ connecting: false, connectError: message });
			toast.error(i18n.t("connectionFailed"), { description: message });
			return null;
		}
	};

	return {
		...initialState,

		connectUsb: (preselected) =>
			runConnect(async () => {
				const device = preselected ?? (await requestDevice());
				if (!device) return null;
				return transportConnectUsb(device);
			}),

		connectWireless: (endpoint) =>
			runConnect(() => transportConnectWireless(endpoint)),

		reconnectFleet: async () => {
			const alreadyConnected = new Set(Object.keys(get().connections));

			const pairedUsb = await getPairedDevices().catch(() => []);
			for (const device of pairedUsb) {
				if (alreadyConnected.has(device.serial)) continue;
				try {
					await finalize(await transportConnectUsb(device));
				} catch {
					// Device didn't answer (unplugged, asleep); leave it for a manual retry.
				}
			}

			const endpoints = Object.values(useWirelessStore.getState().endpoints);
			if (endpoints.length === 0) return;
			const bridge = await detectBridge().catch(() => null);
			if (!bridge) return;
			for (const endpoint of endpoints) {
				if (alreadyConnected.has(endpoint.serial)) continue;
				try {
					await finalize(await transportConnectWireless(endpoint));
				} catch {
					// Stale endpoint (device moved, IP changed); stays in the store for
					// the user to remove or retry.
				}
			}
		},

		setActive: (serial) => {
			const s = get();
			if (!s.connections[serial] || s.activeSerial === serial) return;
			if (s.activeSerial && s.busySerials[s.activeSerial]) {
				toast.warning(i18n.t("fleet.busyProvisioning"));
				return;
			}
			set({ activeSerial: serial });
		},

		disconnect: async (serial) => {
			const target = serial ?? get().activeSerial;
			if (!target) return;
			removeConnection(target, { closeTransport: true });
		},

		disconnectAll: async () => {
			for (const serial of [...get().order]) {
				removeConnection(serial, { closeTransport: true });
			}
		},

		refreshDeviceInfo: async (serial) => {
			const target = serial ?? get().activeSerial;
			if (!target) return;
			const conn = get().connections[target];
			if (!conn?.adb) return;
			try {
				const info = await getDeviceInfo(conn.adb);
				const model = resolveModel(info.codename);
				set((s) => {
					const current = s.connections[target];
					if (!current) return s;
					return {
						connections: {
							...s.connections,
							[target]: { ...current, deviceInfo: info, portalModel: model },
						},
					};
				});
			} catch (err) {
				set((s) => {
					const current = s.connections[target];
					if (!current) return s;
					return {
						connections: {
							...s.connections,
							[target]: {
								...current,
								error:
									err instanceof Error
										? err.message
										: "Failed to read device info",
							},
						},
					};
				});
			}
		},

		toggleSelected: (serial) =>
			set((s) => {
				if (s.selected[serial]) {
					const { [serial]: _removed, ...selected } = s.selected;
					return { selected };
				}
				return { selected: { ...s.selected, [serial]: true } };
			}),

		clearSelected: () => set({ selected: {} }),

		markBusy: (serial, abort) => {
			provisionAborters.set(serial, abort);
			set((s) => ({ busySerials: { ...s.busySerials, [serial]: true } }));
		},

		clearBusy: (serial) => {
			provisionAborters.delete(serial);
			set((s) => {
				const { [serial]: _removed, ...busySerials } = s.busySerials;
				return { busySerials };
			});
		},

		seedDemoDevices: (infos) => {
			const connections: Record<string, DeviceConnection> = {};
			const order: string[] = [];
			for (const info of infos) {
				connections[info.serial] = {
					serial: info.serial,
					kind: "usb",
					name: info.model,
					adb: null,
					state: "connected",
					error: null,
					deviceInfo: info,
					portalModel: resolveModel(info.codename),
				};
				order.push(info.serial);
			}
			set({ connections, order, activeSerial: order[0] ?? null });
		},
	};
});

function activeConnection(s: FleetState): DeviceConnection | null {
	return s.activeSerial ? (s.connections[s.activeSerial] ?? null) : null;
}

export function useActiveDevice(): DeviceConnection | null {
	return useFleetStore(activeConnection);
}

export function useActiveAdb(): Adb | null {
	return useFleetStore((s) => activeConnection(s)?.adb ?? null);
}

export function useActiveState(): ConnectionState {
	return useFleetStore((s) => activeConnection(s)?.state ?? "disconnected");
}

export function useActiveDeviceInfo(): DeviceInfo | null {
	return useFleetStore((s) => activeConnection(s)?.deviceInfo ?? null);
}

export function useActivePortalModel(): PortalModelInfo | null {
	return useFleetStore((s) => activeConnection(s)?.portalModel ?? null);
}

export function useActiveSerial(): string | null {
	return useFleetStore((s) => s.activeSerial);
}

export function useActiveTransport(): TransportKind | null {
	return useFleetStore((s) => activeConnection(s)?.kind ?? null);
}

export function useActiveError(): string | null {
	return useFleetStore((s) => activeConnection(s)?.error ?? null);
}

export function useFleetConnections(): DeviceConnection[] {
	return useFleetStore(
		useShallow((s) =>
			s.order
				.map((serial) => s.connections[serial])
				.filter((c): c is DeviceConnection => !!c),
		),
	);
}

export function useSelectedSerials(): Record<string, true> {
	return useFleetStore((s) => s.selected);
}

export function useBusySerials(): Record<string, true> {
	return useFleetStore((s) => s.busySerials);
}

export function useConnecting(): boolean {
	return useFleetStore((s) => s.connecting);
}

export function useConnectError(): string | null {
	return useFleetStore((s) => s.connectError);
}

export function getActiveAdb(): Adb | null {
	const s = useFleetStore.getState();
	return activeConnection(s)?.adb ?? null;
}

export function getActiveSerial(): string | null {
	return useFleetStore.getState().activeSerial;
}
