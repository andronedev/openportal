import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import type { AdbDaemonConnection } from "@yume-chan/adb";
import {
	type AdbDaemonWebUsbDevice,
	AdbDaemonWebUsbDeviceManager,
} from "@yume-chan/adb-daemon-webusb";
import { credentialStore } from "./credential-store";
import type { WirelessEndpoint } from "./wireless";
import { openWsConnection } from "./ws-connection";

const USB_FILTER = { vendorId: 0x2ec6 };

export type TransportKind = "usb" | "wireless";

export interface ActiveConnection {
	adb: Adb;
	kind: TransportKind;
	serial: string;
	name: string | undefined;
	watchDisconnect: (onDisconnect: () => void) => () => void;
	close: () => Promise<void>;
}

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
	return mgr.requestDevice({ filters: [USB_FILTER] });
}

export async function getPairedDevices(): Promise<AdbDaemonWebUsbDevice[]> {
	const mgr = getManager();
	if (!mgr) return [];
	return mgr.getDevices({ filters: [USB_FILTER] });
}

async function authenticate(
	serial: string,
	connection: AdbDaemonConnection,
): Promise<Adb> {
	const transport = await AdbDaemonTransport.authenticate({
		serial,
		connection,
		credentialStore,
	});
	return new Adb(transport);
}

export async function connectUsb(
	device: AdbDaemonWebUsbDevice,
): Promise<ActiveConnection> {
	const connection = await device.connect();
	const adb = await authenticate(device.serial, connection);
	return {
		adb,
		kind: "usb",
		serial: device.serial,
		name: device.name,
		watchDisconnect: (onDisconnect) => watchUsbDisconnect(device, onDisconnect),
		close: () => adb.close(),
	};
}

export async function connectWireless(
	endpoint: WirelessEndpoint,
): Promise<ActiveConnection> {
	const { connection, socket } = await openWsConnection(endpoint);
	const adb = await authenticate(endpoint.serial, connection);
	return {
		adb,
		kind: "wireless",
		serial: endpoint.serial,
		name: endpoint.serial,
		watchDisconnect: (onDisconnect) => {
			const handler = () => onDisconnect();
			socket.addEventListener("close", handler, { once: true });
			return () => socket.removeEventListener("close", handler);
		},
		close: async () => {
			await adb.close();
			try {
				socket.close();
			} catch {
				// ignore
			}
		},
	};
}

function watchUsbDisconnect(
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
