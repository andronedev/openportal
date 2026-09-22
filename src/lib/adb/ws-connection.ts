import {
	type AdbPacketData,
	AdbPacketHeader,
	type AdbPacketInit,
	AdbPacketSerializeStream,
} from "@yume-chan/adb";
import {
	BufferedReadableStream,
	type Consumable,
	PushReadableStream,
	ReadableStream,
	type ReadableWritablePair,
	WritableStream,
} from "@yume-chan/stream-extra";
import type { WirelessEndpoint } from "./wireless";

const EMPTY = new Uint8Array(0);
const BRIDGE_PORT = 8787;

export const BRIDGE_DOWNLOAD_URL =
	"https://github.com/andronedev/openportal/releases";

type AdbConnectionPair = ReadableWritablePair<
	AdbPacketData,
	Consumable<AdbPacketInit>
>;

function bridgeAuthority(): { http: string; ws: string } {
	const secure = globalThis.location?.protocol === "https:";
	const host = secure ? "local.openportal.cc" : "127.0.0.1";
	const authority = `${host}:${BRIDGE_PORT}`;
	return {
		http: `${secure ? "https" : "http"}://${authority}`,
		ws: `${secure ? "wss" : "ws"}://${authority}`,
	};
}

function healthUrl(): string {
	return `${bridgeAuthority().http}/health`;
}

function relayUrl(endpoint: WirelessEndpoint): string {
	const ip = encodeURIComponent(endpoint.ip);
	return `${bridgeAuthority().ws}/adb?ip=${ip}&port=${endpoint.port}`;
}

export interface BridgeInfo {
	version: string;
}

export async function detectBridge(
	timeoutMs = 1500,
): Promise<BridgeInfo | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(healthUrl(), { signal: controller.signal });
		if (!res.ok) return null;
		const body = (await res.json()) as Partial<BridgeInfo>;
		return { version: body.version ?? "unknown" };
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

export interface WsConnection {
	connection: AdbConnectionPair;
	socket: WebSocket;
}

export function openWsConnection(
	endpoint: WirelessEndpoint,
): Promise<WsConnection> {
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(relayUrl(endpoint));
		socket.binaryType = "arraybuffer";

		socket.addEventListener(
			"error",
			() => reject(new Error("bridgeUnreachable")),
			{ once: true },
		);

		socket.addEventListener(
			"open",
			() => resolve({ connection: buildConnection(socket), socket }),
			{ once: true },
		);
	});
}

function buildConnection(socket: WebSocket): AdbConnectionPair {
	const incoming = new PushReadableStream<Uint8Array>((controller) => {
		socket.addEventListener("message", (event) => {
			controller.enqueue(new Uint8Array(event.data as ArrayBuffer));
		});
		socket.addEventListener("close", () => controller.close());
		socket.addEventListener("error", () =>
			controller.error(new Error("bridgeClosed")),
		);
	});

	const buffered = new BufferedReadableStream(incoming);
	const readable = new ReadableStream<AdbPacketData>({
		async pull(controller) {
			try {
				const header = await AdbPacketHeader.deserialize(buffered);
				const payload =
					header.payloadLength === 0
						? EMPTY
						: await buffered.readExactly(header.payloadLength);
				controller.enqueue({
					command: header.command,
					arg0: header.arg0,
					arg1: header.arg1,
					payload,
				});
			} catch {
				controller.close();
			}
		},
		cancel() {
			buffered.cancel().catch(() => {});
		},
	});

	const serializer = new AdbPacketSerializeStream();
	serializer.readable
		.pipeTo(
			new WritableStream<Consumable<Uint8Array>>({
				write(chunk) {
					socket.send(chunk.value);
					chunk.consume();
				},
				close() {
					closeSocket(socket);
				},
				abort() {
					closeSocket(socket);
				},
			}),
		)
		.catch(() => {});

	return { readable, writable: serializer.writable };
}

function closeSocket(socket: WebSocket): void {
	try {
		socket.close();
	} catch {
		// ignore
	}
}
