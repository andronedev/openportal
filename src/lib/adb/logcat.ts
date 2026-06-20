import type { Adb } from "@yume-chan/adb";
import {
	type ReadableStream,
	SplitStringStream,
	TextDecoderStream,
} from "@yume-chan/stream-extra";
import { execShell } from "./shell";

export type LogPriority = "V" | "D" | "I" | "W" | "E" | "F";

export interface LogLine {
	id: number;
	time: string;
	pid: string;
	priority: LogPriority | "?";
	tag: string;
	message: string;
	raw: string;
}

export interface LogcatHandle {
	stop: () => Promise<void>;
}

// threadtime format: "MM-DD HH:MM:SS.mmm  PID  TID P TAG: message"
const THREADTIME =
	/^(\d\d-\d\d \d\d:\d\d:\d\d\.\d+)\s+(\d+)\s+\d+\s+([VDIWEF])\s+(.*?):\s?(.*)$/;

let counter = 0;

export function parseLogLine(raw: string): LogLine {
	const match = THREADTIME.exec(raw);
	counter += 1;
	if (!match) {
		return {
			id: counter,
			time: "",
			pid: "",
			priority: "?",
			tag: "",
			message: raw,
			raw,
		};
	}
	return {
		id: counter,
		time: match[1] ?? "",
		pid: match[2] ?? "",
		priority: (match[3] as LogPriority) ?? "?",
		tag: match[4] ?? "",
		message: match[5] ?? "",
		raw,
	};
}

/**
 * Streams `logcat` output line by line. Returns a handle whose `stop()` kills
 * the remote process. Falls back to the legacy (none) protocol when the shell
 * protocol is unavailable.
 */
export async function streamLogcat(
	adb: Adb,
	onLine: (line: LogLine) => void,
	onError?: (error: unknown) => void,
): Promise<LogcatHandle> {
	const command = ["logcat", "-v", "threadtime"];
	let stopped = false;

	const consume = async (stream: AsyncIterable<string>) => {
		try {
			for await (const line of stream) {
				if (stopped) break;
				if (line.length > 0) onLine(parseLogLine(line));
			}
		} catch (err) {
			if (!stopped) onError?.(err);
		}
	};

	const shell = adb.subprocess.shellProtocol;
	if (shell) {
		const proc = await shell.spawn(command);
		void consume(toLineStream(proc.stdout));
		return {
			stop: async () => {
				stopped = true;
				await proc.kill();
			},
		};
	}

	const proc = await adb.subprocess.noneProtocol.spawn(command);
	void consume(toLineStream(proc.output));
	return {
		stop: async () => {
			stopped = true;
			await proc.kill();
		},
	};
}

/**
 * One-shot dump of the current logcat buffer (`logcat -d`). Used by flows that
 * poll for a specific log marker (e.g. the Alexa connect handshake) instead of
 * streaming. Returns the raw buffer as text.
 */
export async function dumpLogcat(adb: Adb): Promise<string> {
	const { stdout } = await execShell(adb, "logcat -d -v threadtime", {
		timeoutMs: 60_000,
	});
	return stdout;
}

/** Clears the logcat buffer (`logcat -c`), so a later dump only sees new lines. */
export async function clearLogcat(adb: Adb): Promise<void> {
	await execShell(adb, "logcat -c");
}

function toLineStream(
	stream: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
	return stream
		.pipeThrough(new TextDecoderStream())
		.pipeThrough(new SplitStringStream("\n"));
}
