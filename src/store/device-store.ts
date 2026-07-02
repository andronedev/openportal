import i18n from "@/i18n";
import {
	connectDevice,
	disconnectDevice,
	requestDevice,
	watchDisconnect,
} from "@/lib/adb/connection";
import { getDeviceInfo } from "@/lib/adb/device-info";
import type { ConnectionState, DeviceInfo } from "@/lib/adb/types";
import { resolveModel } from "@/lib/device/models";
import type { PortalModelInfo } from "@/lib/device/models";
import type { Adb } from "@yume-chan/adb";
import type { AdbDaemonWebUsbDevice } from "@yume-chan/adb-daemon-webusb";
import { toast } from "sonner";
import { create } from "zustand";

interface DeviceStore {
	state: ConnectionState;
	adb: Adb | null;
	device: AdbDaemonWebUsbDevice | null;
	error: string | null;
	deviceInfo: DeviceInfo | null;
	portalModel: PortalModelInfo | null;
	unwatch: (() => void) | null;

	connect: (preselected?: AdbDaemonWebUsbDevice) => Promise<void>;
	disconnect: () => Promise<void>;
	refreshDeviceInfo: () => Promise<void>;
}

export const useDeviceStore = create<DeviceStore>((set, get) => ({
	state: "disconnected",
	adb: null,
	device: null,
	error: null,
	deviceInfo: null,
	portalModel: null,
	unwatch: null,

	connect: async (preselected?: AdbDaemonWebUsbDevice) => {
		try {
			set({ state: "connecting", error: null });

			const device = preselected ?? (await requestDevice());
			if (!device) {
				set({ state: "disconnected" });
				return;
			}

			set({ state: "authenticating", device });
			const adb = await connectDevice(device);

			// Recover gracefully if the cable is pulled out.
			const unwatch = watchDisconnect(device, () => {
				const current = get();
				if (current.device === device) {
					current.unwatch?.();
					toast.warning(i18n.t("deviceLost"));
					set({
						state: "disconnected",
						adb: null,
						device: null,
						deviceInfo: null,
						portalModel: null,
						unwatch: null,
					});
				}
			});

			set({ state: "connected", adb, unwatch });

			await get().refreshDeviceInfo();
			toast.success(i18n.t("deviceConnected", { name: device.name }));
		} catch (err) {
			const message =
				err instanceof Error ? err.message : i18n.t("connectionFailed");
			set({ state: "error", error: message });
			toast.error(i18n.t("connectionFailed"), { description: message });
		}
	},

	disconnect: async () => {
		const { adb, unwatch } = get();
		unwatch?.();
		if (adb) {
			try {
				await disconnectDevice(adb);
			} catch {
				// ignore disconnect errors
			}
		}
		set({
			state: "disconnected",
			adb: null,
			device: null,
			deviceInfo: null,
			portalModel: null,
			error: null,
			unwatch: null,
		});
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
}));
