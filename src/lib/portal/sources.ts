import { deviceFetchText } from "@/lib/adb/online-install";
import { getprop } from "@/lib/adb/shell";
import { MORPHE_MANIFEST_URLS } from "@/lib/security/manifest-key";
import {
	type MorpheManifestApp,
	verifyAndParseManifest,
} from "@/lib/security/verify-manifest";
import type { Adb } from "@yume-chan/adb";
import type { CatalogApp } from "./catalog";
import fdroidMirrors from "./fdroid-mirrors.json";

const FDROID_MIRRORS: string[] =
	fdroidMirrors.length > 0 ? fdroidMirrors : ["https://f-droid.org/repo"];

export interface ResolvedApk {
	version: string;
	url: string;
	urls: string[];
	sha256?: string;
}

export function canAutoInstall(app: CatalogApp): boolean {
	return (
		app.source === "github" ||
		app.source === "fdroid" ||
		app.source === "url" ||
		app.source === "morphe"
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
			return app.downloadUrl;
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
			return "Web";
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

async function fetchMorpheManifest(adb: Adb): Promise<string> {
	if (MORPHE_MANIFEST_URLS.length === 0) {
		throw new Error("No Morphe manifest URL configured");
	}
	let lastError: Error | null = null;
	for (const url of MORPHE_MANIFEST_URLS) {
		try {
			return await deviceFetchText(adb, url);
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
		}
	}
	throw lastError ?? new Error("Could not fetch the Morphe manifest");
}

async function pickArch(
	adb: Adb,
	entries: MorpheManifestApp[],
): Promise<MorpheManifestApp | undefined> {
	if (entries.length <= 1) return entries[0];
	let abis: string[] = [];
	try {
		const primary = (await getprop(adb, "ro.product.cpu.abi")).trim();
		const list = (await getprop(adb, "ro.product.cpu.abilist")).trim();
		abis = [primary, ...list.split(",")]
			.map((abi) => abi.trim())
			.filter((abi) => abi.length > 0);
	} catch {}
	for (const abi of abis) {
		const match = entries.find((entry) => entry.arch === abi);
		if (match) return match;
	}
	return (
		entries.find((entry) => !entry.arch || entry.arch === "universal") ??
		entries[0]
	);
}

export async function resolveMorpheApk(
	adb: Adb,
	app: CatalogApp,
): Promise<ResolvedApk> {
	const manifest = await verifyAndParseManifest(await fetchMorpheManifest(adb));
	const entries = manifest.apps.filter(
		(entry) => entry.packageName === app.packageName,
	);
	const entry = await pickArch(adb, entries);
	if (!entry) {
		throw new Error("This app is not in the Morphe manifest");
	}
	const url = entry.urls[0];
	if (!url) {
		throw new Error("No download URL in the Morphe manifest");
	}
	return {
		version: entry.version,
		url,
		urls: entry.urls,
		sha256: entry.sha256,
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
		case "morphe":
			return resolveMorpheApk(adb, app);
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
