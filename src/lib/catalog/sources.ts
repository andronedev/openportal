import { deviceFetchText } from "@/lib/adb/online-install";
import type { Adb } from "@yume-chan/adb";
import fdroidMirrors from "./fdroid-mirrors.json";
import { type CatalogApp, isPanelProgram } from "./types";

const FDROID_MIRRORS: string[] =
	fdroidMirrors.length > 0 ? fdroidMirrors : ["https://f-droid.org/repo"];

export interface ResolvedApk {
	version: string;
	versionCode?: number;
	url: string;
	urls: string[];
	sha256?: string;
}

/**
 * Whether the APK can be resolved to a download by {@link resolveApk} (the
 * standard sources the device can fetch on its own). Drives the passive
 * update-check; apps whose install is driven by a `program` are not resolvable
 * this way and are excluded.
 */
export function hasResolvableSource(app: CatalogApp): boolean {
	return (
		app.source === "github" || app.source === "fdroid" || app.source === "url"
	);
}

/**
 * Whether OpenPortal can install the app from within the UI: a resolvable
 * source, a `morphe` app (installed by the first-party Morphe program), or a
 * `program` that handles the install itself (a launcher provisioned through a
 * panel/sandboxed program).
 */
export function canAutoInstall(app: CatalogApp): boolean {
	return (
		hasResolvableSource(app) ||
		app.source === "morphe" ||
		(isPanelProgram(app.program) && app.program.handlesInstall === true)
	);
}

/** Best-effort link to where an app comes from, for a "view source" affordance. */
export function getSourceUrl(app: CatalogApp): string | undefined {
	switch (app.source) {
		case "github":
			return app.repo ? `https://github.com/${app.repo}` : app.downloadUrl;
		case "fdroid":
			return `https://f-droid.org/packages/${app.packageName}`;
		case "url":
			return app.apkUrl ?? app.downloadUrl;
		default:
			return app.repo ? `https://github.com/${app.repo}` : app.downloadUrl;
	}
}

/** Human-facing name of the app's source provider (GitHub, F-Droid, …). */
export function getSourceLabel(app: CatalogApp): string {
	switch (app.source) {
		case "github":
			return "GitHub";
		case "fdroid":
			return "F-Droid";
		case "morphe":
			return "Morphe";
		default:
			return app.repo ? "GitHub" : "Web";
	}
}

interface GithubAsset {
	name: string;
	browser_download_url: string;
}
interface GithubRelease {
	tag_name?: string;
	assets?: GithubAsset[];
}

/**
 * Reads the latest GitHub release from api.github.com (CORS-friendly). When the
 * release ships several APK variants, `assetPattern` (a case-insensitive regex)
 * selects the right one; without it, the first `.apk` asset wins.
 */
export async function resolveGithubLatest(
	repo: string,
	assetPattern?: string,
): Promise<ResolvedApk> {
	const res = await fetch(
		`https://api.github.com/repos/${repo}/releases/latest`,
		{ headers: { Accept: "application/vnd.github+json" } },
	);
	if (!res.ok) {
		throw new Error(`GitHub API returned ${res.status}`);
	}
	const data = (await res.json()) as GithubRelease;
	const apks = data.assets?.filter((a) =>
		a.name.toLowerCase().endsWith(".apk"),
	);
	if (!apks || apks.length === 0) {
		throw new Error("No APK in the latest GitHub release");
	}
	let apk = apks[0];
	if (assetPattern) {
		let matcher: RegExp;
		try {
			matcher = new RegExp(assetPattern, "i");
		} catch {
			throw new Error(`Invalid assetPattern: ${assetPattern}`);
		}
		const match = apks.find((a) => matcher.test(a.name));
		if (!match) {
			throw new Error(`No GitHub release asset matched ${assetPattern}`);
		}
		apk = match;
	}
	if (!apk) {
		throw new Error("No APK in the latest GitHub release");
	}
	return {
		version: (data.tag_name ?? "").replace(/^v/i, ""),
		url: apk.browser_download_url,
		urls: [apk.browser_download_url],
	};
}

interface FdroidPackage {
	versionName?: string;
	versionCode: number;
}
interface FdroidResponse {
	suggestedVersionCode?: number;
	packages?: FdroidPackage[];
}

/**
 * Resolves the latest F-Droid build. The API is fetched *from the device*
 * (CORS-blocked for the browser), then the predictable repo URL is built.
 */
export async function resolveFdroidLatest(
	adb: Adb,
	packageName: string,
): Promise<ResolvedApk> {
	const json = await deviceFetchText(
		adb,
		`https://f-droid.org/api/v1/packages/${packageName}`,
	);
	const data = JSON.parse(json) as FdroidResponse;
	const code = data.suggestedVersionCode ?? data.packages?.[0]?.versionCode;
	if (!code) {
		throw new Error("No F-Droid build found for this package");
	}
	const entry =
		data.packages?.find((p) => p.versionCode === code) ?? data.packages?.[0];
	const file = `${packageName}_${code}.apk`;
	const urls = FDROID_MIRRORS.map((base) => `${base}/${file}`);
	return {
		version: entry?.versionName ?? String(code),
		url: urls[0] ?? `https://f-droid.org/repo/${file}`,
		urls,
	};
}

export async function resolveApk(
	adb: Adb,
	app: CatalogApp,
): Promise<ResolvedApk> {
	switch (app.source) {
		case "github":
			if (!app.repo) throw new Error("Missing GitHub repo");
			return resolveGithubLatest(app.repo, app.assetPattern);
		case "fdroid":
			return resolveFdroidLatest(adb, app.packageName);
		case "url":
			if (!app.apkUrl) throw new Error("Missing APK URL");
			return { version: app.version, url: app.apkUrl, urls: [app.apkUrl] };
		default:
			throw new Error("This app can't be installed automatically");
	}
}

/**
 * Numeric segment-by-segment comparison for a best-effort "update available"
 * signal. Missing or non-numeric segments count as 0, so "2.3" == "2.3.0" ==
 * "2.3-beta", and an installed version *newer* than the published release
 * (e.g. a beta) never reports a phantom update.
 */
export function isNewerVersion(latest: string, installed: string): boolean {
	const segments = (value: string) =>
		value
			.trim()
			.replace(/^v/i, "")
			.split(/[.\-_+]/)
			.map((part) => Number.parseInt(part, 10));
	const a = segments(latest);
	const b = segments(installed);
	if (a.every(Number.isNaN) || b.every(Number.isNaN)) return false;
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const x = a[i];
		const y = b[i];
		const left = x === undefined || Number.isNaN(x) ? 0 : x;
		const right = y === undefined || Number.isNaN(y) ? 0 : y;
		if (left !== right) return left > right;
	}
	return false;
}
