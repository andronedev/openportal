import { deviceFetchText } from "@/lib/adb/online-install";
import type { Adb } from "@yume-chan/adb";
import { CONFIG_ENV_RAW, UPSTREAM_META } from "./provision/upstream/snapshot";

/**
 * Typed view of Immortal's `provisioning/config.env`. The provisioning engine
 * (`src/lib/adb/provision.ts`) is a 1:1 port of `provision.sh`; everything that
 * varies per release (package names, URLs, checksums, package lists, toggles)
 * lives here so it can be sourced from the upstream file rather than hardcoded.
 *
 * Host-kit-only keys (`APK_GLOB`, `ASSET_DIR`, the `*_LOCAL` test overrides,
 * `BSPATCH_EXE`) are intentionally not modelled: OpenPortal replaces those with
 * native behaviour (release resolved via GitHub, photos picked by the user).
 */
export interface ProvisionConfig {
	pkg: string;
	homeActivity: string;
	dreamService: string;
	stockHome: string;
	stockDream: string;
	stockDefaultDream: string;
	verifierPkg: string;
	disableInstallerOverlay: boolean;
	installerOverlayPkgs: string[];
	setLauncher: boolean;
	setScreensaver: boolean;
	disableVerifier: boolean;
	presencePkg: string;
	disablePresence: boolean;
	/** Tri-state: `null` means "ask" (the script defaults to blocking). */
	disableOta: boolean | null;
	otaPackages: string[];
	permissions: string[];
	preinstallFdroid: string[];
	preinstallApks: string[];
	bootApps: string[];
	enableFleet: boolean;
	fleetName: string;
	fleetAgentPort: number;
	releaseRepo: string;
	releaseApkUrl: string;
	shizukuApkUrl: string;
	/** Tri-state: `null` means "ask" (the script defaults to skipping). */
	restoreAlexa: boolean | null;
	falconPkg: string;
	falconPatchedUrl: string;
	falconResultSha256: string;
	millenniumPkg: string;
	millenniumApkUrl: string;
	/** Every parsed key, for steps that need a value not promoted above. */
	raw: Record<string, string>;
}

export const IMMORTAL_REPO = UPSTREAM_META.repo;

/** Parses the flat `KEY=VALUE` shell file into a map (comments and blanks skipped). */
export function parseConfigEnvRaw(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
		const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
		if (!match) continue;
		const key = match[1];
		let value = (match[2] ?? "").trim();
		// Strip one layer of matching surrounding quotes, like shell sourcing does.
		if (
			value.length >= 2 &&
			((value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'")))
		) {
			value = value.slice(1, -1);
		}
		if (key) out[key] = value;
	}
	return out;
}

const bool = (raw: Record<string, string>, key: string, fallback: boolean) => {
	const value = raw[key];
	if (value === undefined || value.length === 0) return fallback;
	return value.toLowerCase() === "true";
};

const tri = (raw: Record<string, string>, key: string): boolean | null => {
	const value = raw[key];
	if (value === undefined || value.length === 0) return null;
	return value.toLowerCase() === "true";
};

const list = (raw: Record<string, string>, key: string): string[] => {
	const value = raw[key];
	if (!value) return [];
	return value.split(/\s+/).filter((token) => token.length > 0);
};

const str = (raw: Record<string, string>, key: string, fallback = "") =>
	raw[key] ?? fallback;

/** Maps the raw key/value map onto the typed config, applying script defaults. */
export function toProvisionConfig(
	raw: Record<string, string>,
): ProvisionConfig {
	return {
		pkg: str(raw, "PKG"),
		homeActivity: str(raw, "HOME_ACTIVITY"),
		dreamService: str(raw, "DREAM_SERVICE"),
		stockHome: str(raw, "STOCK_HOME"),
		stockDream: str(raw, "STOCK_DREAM"),
		stockDefaultDream: str(raw, "STOCK_DEFAULT_DREAM"),
		verifierPkg: str(raw, "VERIFIER_PKG", "com.facebook.appverifier"),
		disableInstallerOverlay: bool(raw, "DISABLE_INSTALLER_OVERLAY", true),
		installerOverlayPkgs: list(raw, "INSTALLER_OVERLAY_PKGS"),
		setLauncher: bool(raw, "SET_LAUNCHER", true),
		setScreensaver: bool(raw, "SET_SCREENSAVER", true),
		disableVerifier: bool(raw, "DISABLE_VERIFIER", true),
		presencePkg: str(raw, "PRESENCE_PKG"),
		disablePresence: bool(raw, "DISABLE_PRESENCE", false),
		disableOta: tri(raw, "DISABLE_OTA"),
		otaPackages: list(raw, "OTA_PACKAGES"),
		permissions: list(raw, "PERMISSIONS"),
		preinstallFdroid: list(raw, "PREINSTALL_FDROID"),
		preinstallApks: list(raw, "PREINSTALL_APKS"),
		bootApps: list(raw, "BOOT_APPS"),
		enableFleet: bool(raw, "ENABLE_FLEET", false),
		fleetName: str(raw, "FLEET_NAME"),
		fleetAgentPort: Number.parseInt(str(raw, "FLEET_AGENT_PORT", "8723"), 10),
		releaseRepo: str(raw, "RELEASE_REPO", IMMORTAL_REPO),
		releaseApkUrl: str(raw, "RELEASE_APK_URL"),
		shizukuApkUrl: str(raw, "SHIZUKU_APK_URL"),
		restoreAlexa: tri(raw, "RESTORE_ALEXA"),
		falconPkg: str(raw, "FALCON_PKG", "com.amazon.alexa.multimodal.falcon"),
		falconPatchedUrl: str(raw, "FALCON_PATCHED_URL"),
		falconResultSha256: str(raw, "FALCON_RESULT_SHA256"),
		millenniumPkg: str(raw, "MILLENNIUM_PKG", "com.millennium"),
		millenniumApkUrl: str(raw, "MILLENNIUM_APK_URL"),
		raw,
	};
}

export function parseConfigEnv(text: string): ProvisionConfig {
	return toProvisionConfig(parseConfigEnvRaw(text));
}

export interface LoadedProvisionConfig {
	cfg: ProvisionConfig;
	/** The git ref the config was read from (a release tag, or the vendored commit). */
	ref: string;
	/** `live` = fetched from upstream this session; `vendored` = offline fallback. */
	source: "live" | "vendored";
}

interface GithubRelease {
	tag_name?: string;
}

/** Resolves the latest published release tag (CORS-friendly api.github.com). */
async function resolveLatestTag(repo: string): Promise<string | null> {
	try {
		const res = await fetch(
			`https://api.github.com/repos/${repo}/releases/latest`,
			{ headers: { Accept: "application/vnd.github+json" } },
		);
		if (!res.ok) return null;
		const data = (await res.json()) as GithubRelease;
		return data.tag_name ?? null;
	} catch {
		return null;
	}
}

function vendored(ref: string): LoadedProvisionConfig {
	return { cfg: parseConfigEnv(CONFIG_ENV_RAW), ref, source: "vendored" };
}

/**
 * Loads the provisioning config, preferring the live upstream `config.env` at the
 * latest release tag so value changes (URLs, checksums, package lists) flow in
 * without an OpenPortal change. Falls back to the vendored snapshot when offline
 * or when there is no device to fetch through. The fetch is done device-side
 * (CORS-free) and verified only by being valid `KEY=VALUE` text; the engine that
 * consumes it is the reviewed, pinned part.
 */
export async function loadProvisionConfig(
	adb: Adb | null,
): Promise<LoadedProvisionConfig> {
	const repo = IMMORTAL_REPO;
	if (!adb) return vendored(UPSTREAM_META.latestReleaseTag);

	const tag = (await resolveLatestTag(repo)) ?? UPSTREAM_META.latestReleaseTag;
	const url = `https://raw.githubusercontent.com/${repo}/${tag}/provisioning/config.env`;
	try {
		const text = await deviceFetchText(adb, url);
		const raw = parseConfigEnvRaw(text);
		if (!raw.PKG) throw new Error("config.env missing PKG");
		return { cfg: toProvisionConfig(raw), ref: tag, source: "live" };
	} catch {
		return vendored(tag);
	}
}
