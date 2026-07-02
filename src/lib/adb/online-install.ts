import type { Adb } from "@yume-chan/adb";
import { execShell } from "./shell";

export type Downloader = "curl" | "wget";

/**
 * Detects an HTTP downloader available in the device shell. We prefer curl
 * (handles HTTPS + redirects reliably); toybox wget is a fallback.
 */
export async function detectDownloader(adb: Adb): Promise<Downloader | null> {
	const { stdout } = await execShell(
		adb,
		"command -v curl >/dev/null 2>&1 && echo curl || (command -v wget >/dev/null 2>&1 && echo wget || echo none)",
	);
	const value = stdout.trim();
	return value === "curl" || value === "wget" ? value : null;
}

function getCommand(downloader: Downloader, url: string): string {
	// -L follow redirects (GitHub assets redirect to a signed URL).
	return downloader === "curl"
		? `curl -fsSL "${url}"`
		: `wget -q -O - "${url}"`;
}

/**
 * Fetches a URL *from the device* and returns the body as text. This bypasses
 * browser CORS entirely (the response comes back as shell stdout), which is how
 * we read CORS-blocked APIs like F-Droid's.
 */
export async function deviceFetchText(adb: Adb, url: string): Promise<string> {
	const downloader = await detectDownloader(adb);
	if (!downloader) {
		throw new Error("Device has no curl or wget");
	}
	const { stdout, exitCode } = await execShell(
		adb,
		getCommand(downloader, url),
		{
			timeoutMs: 30_000,
		},
	);
	if (exitCode !== 0) {
		throw new Error(`Request failed: ${url}`);
	}
	return stdout;
}
