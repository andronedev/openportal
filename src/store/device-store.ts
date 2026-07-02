import i18n from "@/i18n";
import {
	type ActiveConnection,
	type TransportKind,
	connectUsb,
	connectWireless,
	requestDevice,
} from "@/lib/adb/connection";
import { getDeviceInfo } from "@/lib/adb/device-info";
import type { ConnectionState, DeviceInfo } from "@/lib/adb/types";
import type { WirelessEndpoint } from "@/lib/adb/wireless";
import { resolveModel } from "@/lib/device/models";
import type { PortalModelInfo } from "@/lib/device/models";
import type { Adb } from "@yume-chan/adb";
import type { AdbDaemonWebUsbDevice } from "@yume-chan/adb-daemon-webusb";
import { toast } from "sonner";
import { create } from "zustand";

interface DeviceStore {
	state: ConnectionState;
	adb: Adb | null;
	transport: TransportKind | null;
	serial: string | null;
	error: string | null;
	deviceInfo: DeviceInfo | null;
	portalModel: PortalModelInfo | null;
	unwatch: (() => void) | null;
	closeConnection: (() => Promise<void>) | null;

	connect: (preselected?: AdbDaemonWebUsbDevice) => Promise<void>;
	connectViaWireless: (endpoint: WirelessEndpoint) => Promise<void>;
	disconnect: () => Promise<void>;
	refreshDeviceInfo: () => Promise<void>;
}

const disconnectedState = {
	state: "disconnected" as ConnectionState,
	adb: null,
	transport: null,
	serial: null,
	deviceInfo: null,
	portalModel: null,
	unwatch: null,
	closeConnection: null,
};

export const useDeviceStore = create<DeviceStore>((set, get) => {
	const finalize = async (active: ActiveConnection) => {
		const unwatch = active.watchDisconnect(() => {
			const current = get();
			if (current.adb === active.adb) {
				current.unwatch?.();
				toast.warning(i18n.t("deviceLost"));
				set({ ...disconnectedState });
			}
		});

		set({
			state: "connected",
			adb: active.adb,
			transport: active.kind,
			serial: active.serial,
			unwatch,
			closeConnection: active.close,
		});

		await get().refreshDeviceInfo();
		toast.success(i18n.t("deviceConnected", { name: active.name }));
	};

	const runConnect = async (
		produce: () => Promise<ActiveConnection | null>,
	) => {
		try {
			set({ state: "connecting", error: null });
			const active = await produce();
			if (!active) {
				set({ ...disconnectedState });
				return;
			}
			await finalize(active);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : i18n.t("connectionFailed");
			set({ state: "error", error: message });
			toast.error(i18n.t("connectionFailed"), { description: message });
		}
	};

	return {
		...disconnectedState,
		error: null,

		connect: (preselected?: AdbDaemonWebUsbDevice) =>
			runConnect(async () => {
				const device = preselected ?? (await requestDevice());
				if (!device) return null;
				set({ state: "authenticating" });
				return connectUsb(device);
			}),

		connectViaWireless: (endpoint: WirelessEndpoint) =>
			runConnect(async () => {
				set({ state: "authenticating" });
				return connectWireless(endpoint);
			}),

		disconnect: async () => {
			const { unwatch, closeConnection } = get();
			unwatch?.();
			if (closeConnection) {
				try {
					await closeConnection();
				} catch {
					// ignore disconnect errors
				}
			}
			set({ ...disconnectedState, error: null });
		},

		refreshDeviceInfo: async () => {
			const { adb } = get();
			if (!adb) return;

			try {
				const info = await getDeviceInfo(adb);
				const model = resolveModel(info.codename);
				set({ deviceInfo: info, portalModel: model });
			} catch (err) {
				set({
					error:
						err instanceof Error ? err.message : "Failed to read device info",
				});
			}
		},
	};
});
