import { deviceFetchText } from "@/lib/adb/online-install";
import type { Adb } from "@yume-chan/adb";
import { CONFIG_ENV_RAW, UPSTREAM_META } from "./provision/upstream/snapshot";

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
	restoreAlexa: boolean | null;
	falconPkg: string;
	falconPatchedUrl: string;
	falconResultSha256: string;
	millenniumPkg: string;
	millenniumApkUrl: string;
	raw: Record<string, string>;
}

export const IMMORTAL_REPO = UPSTREAM_META.repo;

export function parseConfigEnvRaw(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
		const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
		if (!match) continue;
		const key = match[1];
		let value = (match[2] ?? "").trim();
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

const PKG_RE = /^[A-Za-z0-9_.]+$/;
const COMPONENT_RE = /^[A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const VERSION_CODE_RE = /^[0-9]+$/;
const SHELL_UNSAFE_RE = /[\s"'`$;|&<>(){}\\]/;

function isSafeUrl(value: string): boolean {
	if (value.length === 0) return true;
	if (!value.startsWith("https://")) return false;
	if (SHELL_UNSAFE_RE.test(value)) return false;
	try {
		new URL(value);
		return true;
	} catch {
		return false;
	}
}

const pkgOk = (v: string) => v.length === 0 || PKG_RE.test(v);
const componentOk = (v: string) => v.length === 0 || COMPONENT_RE.test(v);

export function findConfigViolations(cfg: ProvisionConfig): string[] {
	const out: string[] = [];
	const pkg = (label: string, v: string) => {
		if (!pkgOk(v)) out.push(`${label}=${v}`);
	};
	const component = (label: string, v: string) => {
		if (!componentOk(v)) out.push(`${label}=${v}`);
	};
	const url = (label: string, v: string) => {
		if (!isSafeUrl(v)) out.push(`${label}=${v}`);
	};

	pkg("PKG", cfg.pkg);
	pkg("VERIFIER_PKG", cfg.verifierPkg);
	pkg("PRESENCE_PKG", cfg.presencePkg);
	pkg("FALCON_PKG", cfg.falconPkg);
	pkg("MILLENNIUM_PKG", cfg.millenniumPkg);
	component("HOME_ACTIVITY", cfg.homeActivity);
	component("DREAM_SERVICE", cfg.dreamService);
	component("STOCK_HOME", cfg.stockHome);
	component("STOCK_DREAM", cfg.stockDream);
	component("STOCK_DEFAULT_DREAM", cfg.stockDefaultDream);
	for (const p of cfg.installerOverlayPkgs) pkg("INSTALLER_OVERLAY_PKGS", p);
	for (const p of cfg.otaPackages) pkg("OTA_PACKAGES", p);
	for (const p of cfg.bootApps) pkg("BOOT_APPS", p);
	for (const p of cfg.permissions) pkg("PERMISSIONS", p);
	for (const spec of cfg.preinstallFdroid) {
		const [id, vc] = spec.split(":");
		if (id === undefined || !PKG_RE.test(id))
			out.push(`PREINSTALL_FDROID=${spec}`);
		else if (vc !== undefined && vc.length > 0 && !VERSION_CODE_RE.test(vc))
			out.push(`PREINSTALL_FDROID=${spec}`);
	}
	if (!REPO_RE.test(cfg.releaseRepo))
		out.push(`RELEASE_REPO=${cfg.releaseRepo}`);
	url("RELEASE_APK_URL", cfg.releaseApkUrl);
	url("SHIZUKU_APK_URL", cfg.shizukuApkUrl);
	url("FALCON_PATCHED_URL", cfg.falconPatchedUrl);
	url("MILLENNIUM_APK_URL", cfg.millenniumApkUrl);
	for (const u of cfg.preinstallApks) url("PREINSTALL_APKS", u);
	return out;
}

export interface LoadedProvisionConfig {
	cfg: ProvisionConfig;
	ref: string;
	source: "live" | "vendored";
}

interface GithubRelease {
	tag_name?: string;
}

export async function resolveLatestTag(repo: string): Promise<string | null> {
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
		const cfg = toProvisionConfig(raw);
		const violations = findConfigViolations(cfg);
		if (violations.length > 0) {
			throw new Error(
				`config.env failed validation: ${violations.slice(0, 5).join(", ")}`,
			);
		}
		return { cfg, ref: tag, source: "live" };
	} catch {
		return vendored(tag);
	}
}
