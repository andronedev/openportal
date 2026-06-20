import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import {
	type AdbDaemonWebUsbDevice,
	AdbDaemonWebUsbDeviceManager,
} from "@yume-chan/adb-daemon-webusb";
import { credentialStore } from "./credential-store";

/**
 * WebUSB vendor-ID filters for Meta Portal devices.
 *
 * - 0x2ec6  Meta Platforms USB VID (Portal Gen 2+, Portal Go, Portal TV)
 * - 0x18d1  Google ADB VID (Portal Gen 1 — codename "aloha" uses product ID
 *           0x1804)
 */
const USB_FILTERS: USBDeviceFilter[] = [
	{ vendorId: 0x2ec6 },
	{ vendorId: 0x18d1, productId: 0x1804 },
];

let manager: AdbDaemonWebUsbDeviceManager | undefined;

function getManager(): AdbDaemonWebUsbDeviceManager | undefined {
	if (!manager && globalThis.navigator?.usb) {
		manager = new AdbDaemonWebUsbDeviceManager(navigator.usb);
	}
	return manager;
}

export function isWebUsbSupported(): boolean {
	return !!globalThis.navigator?.usb;
}

export function isSecureContext(): boolean {
	return globalThis.isSecureContext;
}

export async function requestDevice(): Promise<
	AdbDaemonWebUsbDevice | undefined
> {
	const mgr = getManager();
	if (!mgr) return undefined;
	return mgr.requestDevice({ filters: USB_FILTERS });
}

export async function getPairedDevices(): Promise<AdbDaemonWebUsbDevice[]> {
	const mgr = getManager();
	if (!mgr) return [];
	return mgr.getDevices({ filters: USB_FILTERS });
}

export async function connectDevice(
	device: AdbDaemonWebUsbDevice,
): Promise<Adb> {
	const connection = await device.connect();

	const transport = await AdbDaemonTransport.authenticate({
		serial: device.serial,
		connection,
		credentialStore,
	});

	return new Adb(transport);
}

export async function disconnectDevice(adb: Adb): Promise<void> {
	await adb.close();
}

/**
 * Fires `onDisconnect` when the given device is physically unplugged.
 * Returns an unsubscribe function. No-op when WebUSB is unavailable.
 */
export function watchDisconnect(
	device: AdbDaemonWebUsbDevice,
	onDisconnect: () => void,
): () => void {
	const usb = globalThis.navigator?.usb;
	if (!usb) return () => {};

	const handler = (event: USBConnectionEvent) => {
		if (event.device === device.raw) {
			onDisconnect();
		}
	};

	usb.addEventListener("disconnect", handler);
	return () => usb.removeEventListener("disconnect", handler);
}
