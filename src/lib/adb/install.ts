import type { Adb } from "@yume-chan/adb";
import { ReadableStream as AdbReadableStream } from "@yume-chan/stream-extra";
import { type Downloader, detectDownloader } from "./online-install";
import { execShell } from "./shell";

export type InstallStage = "pushing" | "downloading" | "installing" | "done";

export type InstallProgressFn = (
	stage: InstallStage,
	percent: number | null,
) => void;

/**
 * Where the APK to install comes from. `file` streams a local `File` to the
 * device over the sync protocol; `url` downloads it on the device (no CORS, no
 * browser memory) and optionally verifies its SHA-256 before installing.
 */
export type InstallSource =
	| { kind: "file"; file: File }
	| { kind: "url"; urls: string | string[]; sha256?: string };

export interface InstallOptions {
	/** Flags passed to `pm install` (default `-r`). */
	flags?: string;
	onProgress?: InstallProgressFn;
}

/**
 * The single install entry point. Both the local drag-&-drop path and the
 * catalog download path resolve to a staged APK on the device, then run one
 * shared `pm install`. Callers pick the source; the temp file is always removed.
 */
export async function installApp(
	adb: Adb,
	source: InstallSource,
	opts: InstallOptions = {},
): Promise<void> {
	const flags = opts.flags ?? "-r";
	const onProgress = opts.onProgress;

	const dest =
		source.kind === "file"
			? await pushFileToDevice(adb, source.file, onProgress)
			: await downloadToStaging(adb, source, onProgress);

	try {
		onProgress?.("installing", null);
		const install = await execShell(adb, `pm install ${flags} "${dest}"`, {
			timeoutMs: 180_000,
		});
		if (!install.stdout.includes("Success")) {
			throw new Error(install.stdout || "Install failed");
		}
	} finally {
		await execShell(adb, `rm -f "${dest}"`);
	}

	onProgress?.("done", null);
}

async function pushFileToDevice(
	adb: Adb,
	file: File,
	onProgress?: InstallProgressFn,
): Promise<string> {
	const remotePath = `/data/local/tmp/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

	onProgress?.("pushing", 0);

	const chunkSize = 64 * 1024;
	const total = file.size;
	let sent = 0;
	let pending: Uint8Array | null = null;
	const reader = file.stream().getReader();

	const fileStream = new AdbReadableStream<Uint8Array>({
		async pull(controller) {
			if (!pending) {
				const { done, value } = await reader.read();
				if (done) {
					controller.close();
					return;
				}
				pending = value;
			}
			const slice = pending.subarray(0, chunkSize);
			pending =
				pending.byteLength > chunkSize ? pending.subarray(chunkSize) : null;
			sent += slice.byteLength;
			if (total > 0) {
				onProgress?.("pushing", Math.min(99, Math.round((sent / total) * 100)));
			}
			controller.enqueue(slice);
		},
		cancel(reason) {
			return reader.cancel(reason);
		},
	});

	const sync = await adb.sync();
	try {
		await sync.write({
			filename: remotePath,
			file: fileStream,
			permission: 0o644,
			mtime: Math.floor(Date.now() / 1000),
		});
	} finally {
		await sync.dispose();
	}

	onProgress?.("pushing", 100);
	return remotePath;
}

async function downloadToStaging(
	adb: Adb,
	source: { urls: string | string[]; sha256?: string },
	onProgress?: InstallProgressFn,
): Promise<string> {
	const downloader = await detectDownloader(adb);
	if (!downloader) {
		throw new Error(
			"This device has no curl or wget, so it can't download the APK itself. Use drag & drop instead.",
		);
	}

	const candidates = Array.isArray(source.urls) ? source.urls : [source.urls];
	if (candidates.length === 0) {
		throw new Error("No download URL");
	}

	const dest = `/data/local/tmp/openportal-${Date.now()}.apk`;

	onProgress?.("downloading", null);

	const ordered =
		candidates.length > 1
			? await orderByMeasuredSpeed(adb, downloader, candidates)
			: candidates;

	let downloaded = false;
	let lastError: Error | null = null;
	for (const url of ordered) {
		try {
			await downloadToDevice(adb, downloader, url, dest, onProgress);
			downloaded = true;
			break;
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			await execShell(adb, `rm -f "${dest}"`);
		}
	}
	if (!downloaded) {
		throw lastError ?? new Error("Download failed on the device");
	}

	onProgress?.("downloading", 100);

	if (source.sha256) {
		try {
			await verifyDeviceSha256(adb, dest, source.sha256);
		} catch (err) {
			await execShell(adb, `rm -f "${dest}"`);
			throw err;
		}
	}

	return dest;
}

async function getRemoteSize(
	adb: Adb,
	downloader: Downloader,
	url: string,
): Promise<number | null> {
	if (downloader !== "curl") return null;
	try {
		const { stdout } = await execShell(adb, `curl -fsSLI "${url}"`, {
			timeoutMs: 15_000,
		});
		const matches = [...stdout.matchAll(/content-length:\s*(\d+)/gi)];
		const size = Number(matches.at(-1)?.[1]);
		return Number.isFinite(size) && size > 0 ? size : null;
	} catch {
		return null;
	}
}

async function measureSpeed(adb: Adb, url: string): Promise<number> {
	try {
		const { stdout } = await execShell(
			adb,
			`curl -fsSL --max-time 5 -r 0-524287 -o /dev/null -w "%{speed_download}" "${url}"`,
			{ timeoutMs: 7000 },
		);
		const speed = Number(stdout.trim());
		return Number.isFinite(speed) && speed > 0 ? speed : 0;
	} catch {
		return 0;
	}
}

async function orderByMeasuredSpeed(
	adb: Adb,
	downloader: Downloader,
	urls: string[],
): Promise<string[]> {
	if (downloader !== "curl") return urls;
	const probes = await Promise.all(
		urls.map(async (url) => ({ url, speed: await measureSpeed(adb, url) })),
	);
	if (probes.every((p) => p.speed === 0)) return urls;
	return [...probes].sort((a, b) => b.speed - a.speed).map((p) => p.url);
}

async function verifyDeviceSha256(
	adb: Adb,
	dest: string,
	expected: string,
): Promise<void> {
	const { stdout, exitCode } = await execShell(adb, `sha256sum "${dest}"`, {
		timeoutMs: 120_000,
	});
	const actual = stdout.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
	if (exitCode !== 0 || actual.length === 0) {
		throw new Error("Could not compute the APK checksum on the device");
	}
	if (actual !== expected.trim().toLowerCase()) {
		throw new Error("APK checksum does not match the signed manifest");
	}
}

async function downloadToDevice(
	adb: Adb,
	downloader: Downloader,
	url: string,
	dest: string,
	onProgress?: InstallProgressFn,
): Promise<void> {
	const total = await getRemoteSize(adb, downloader, url);

	const download =
		downloader === "curl"
			? `curl -fsSL -o "${dest}" "${url}"`
			: `wget -q -O "${dest}" "${url}"`;

	let downloadDone = false;
	const downloadPromise = execShell(adb, download, {
		timeoutMs: 180_000,
	}).finally(() => {
		downloadDone = true;
	});

	const progressLoop = (async () => {
		if (!total) return;
		while (!downloadDone) {
			await new Promise((resolve) => setTimeout(resolve, 300));
			if (downloadDone) break;
			try {
				const { stdout } = await execShell(
					adb,
					`wc -c < "${dest}" 2>/dev/null || echo 0`,
				);
				const bytes = Number(stdout.trim());
				if (bytes > 0) {
					onProgress?.(
						"downloading",
						Math.min(99, Math.round((bytes / total) * 100)),
					);
				}
			} catch {}
		}
	})();

	const downloadResult = await downloadPromise;
	await progressLoop;
	if (downloadResult.exitCode !== 0) {
		throw new Error(`Download failed: ${url}`);
	}

	const sizeResult = await execShell(
		adb,
		`wc -c < "${dest}" 2>/dev/null || echo 0`,
	);
	if (Number(sizeResult.stdout.trim()) <= 0) {
		throw new Error("Downloaded file is empty");
	}
}
