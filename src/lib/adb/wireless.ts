import type { Adb } from "@yume-chan/adb";
import { getIpAddress } from "./device-info";

export const WIRELESS_ADB_PORT = 5555;

export interface WirelessEndpoint {
	ip: string;
	port: number;
	serial: string;
}

export interface WirelessStatus {
	enabled: boolean;
	port: number | null;
}

function makeEndpoint(ip: string, port: number): WirelessEndpoint {
	return { ip, port, serial: `${ip}:${port}` };
}

export async function enableWireless(
	adb: Adb,
): Promise<WirelessEndpoint | null> {
	const ip = await getIpAddress(adb);
	if (!ip) return null;
	await adb.tcpip.setPort(WIRELESS_ADB_PORT);
	return makeEndpoint(ip, WIRELESS_ADB_PORT);
}

export async function disableWireless(adb: Adb): Promise<void> {
	await adb.tcpip.disable();
}

export async function getWirelessStatus(adb: Adb): Promise<WirelessStatus> {
	const addresses = await adb.tcpip.getListenAddresses();
	const port = addresses.servicePort ?? addresses.persistPort ?? null;
	return { enabled: port !== null, port };
}
