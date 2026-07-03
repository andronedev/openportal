import type { Adb } from "@yume-chan/adb";

export interface ShellResult {
	stdout: string;
	exitCode: number;
}

export class ShellTimeoutError extends Error {
	constructor(command: string, timeoutMs: number) {
		super(`Command timed out after ${timeoutMs}ms: ${command}`);
		this.name = "ShellTimeoutError";
	}
}

/** Default ceiling for a single shell command before it is considered hung. */
export const DEFAULT_SHELL_TIMEOUT_MS = 30_000;

function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	onTimeout: () => Error,
): Promise<T> {
	if (timeoutMs <= 0) return promise;
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(onTimeout()), timeoutMs);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(err) => {
				clearTimeout(timer);
				reject(err);
			},
		);
	});
}

export async function execShell(
	adb: Adb,
	command: string,
	options: { timeoutMs?: number } = {},
): Promise<ShellResult> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_SHELL_TIMEOUT_MS;

	const run = async (): Promise<ShellResult> => {
		const shellProtocol = adb.subprocess.shellProtocol;
		if (shellProtocol) {
			const result = await shellProtocol.spawnWaitText(command);
			return {
				stdout: result.stdout.trim(),
				exitCode: result.exitCode,
			};
		}

		const output = await adb.subprocess.noneProtocol.spawnWaitText(command);
		return {
			stdout: output.trim(),
			exitCode: 0,
		};
	};

	return withTimeout(
		run(),
		timeoutMs,
		() => new ShellTimeoutError(command, timeoutMs),
	);
}

export async function getprop(adb: Adb, key: string): Promise<string> {
	const { stdout } = await execShell(adb, `getprop ${key}`);
	return stdout;
}

/**
 * The device disconnects mid-command as it reboots, so a normal shell reply
 * never arrives; that failure mode is expected and swallowed here.
 */
export async function reboot(adb: Adb): Promise<void> {
	try {
		await execShell(adb, "reboot", { timeoutMs: 5000 });
	} catch {}
}

export async function getAllProps(adb: Adb): Promise<Map<string, string>> {
	const { stdout } = await execShell(adb, "getprop");
	const props = new Map<string, string>();
	const regex = /\[(.+?)]: \[(.*)]/g;
	for (const match of stdout.matchAll(regex)) {
		const key = match[1];
		const value = match[2];
		if (key && value !== undefined) {
			props.set(key, value);
		}
	}
	return props;
}
