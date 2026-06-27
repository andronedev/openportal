// OpenPortal provisioning SDK — type definitions (API v1).
//
// These types describe the contract between OpenPortal (the host) and a
// provisioning program. Reference this file from your program to get editor
// autocomplete and type-checking with no build step:
//
//   /// <reference path="./provision-sdk.d.ts" />
//   /** @param {Portal} portal */
//   export async function provision(portal, answers) { ... }
//
// Your program runs inside a sandboxed Web Worker. It has no DOM, no network
// (fetch/XHR/WebSocket are removed), and no access to the device except through
// the `portal` object below. Every `portal` call is validated by the host on
// the main thread, where the live ADB connection lives.

/** A live, allowlist-validated view of Immortal's config.env. */
interface ProvisionConfig {
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
	/** Every raw KEY=value from config.env, for fields not modelled above. */
	raw: Record<string, string>;
}

type StepStatus = "running" | "ok" | "warn" | "skip" | "error";
type SettingsNamespace = "global" | "secure" | "system";
type InstallStage = "downloading" | "installing" | "done";

interface InstallOptions {
	/** If set, the host verifies the downloaded APK's sha256 on the device. */
	sha256?: string;
	/** Flags passed to `pm install` (default "-r"). Must match /^[-a-zA-Z0-9 ]*$/. */
	flags?: string;
	onProgress?: (stage: InstallStage, percent: number | null) => void;
}

/**
 * The capability surface. Paths for file ops must live under /sdcard or
 * /data/local/tmp. URLs must be https. `shell` runs raw, but every command is
 * shown in the user's audit log.
 */
interface Portal {
	/** Android API level of the connected device (e.g. 28 for A9, 29 for A10). */
	readonly sdk: number;
	readonly cfg: ProvisionConfig;
	shell(
		command: string,
		opts?: { timeoutMs?: number },
	): Promise<{ stdout: string; exitCode: number }>;
	getprop(key: string): Promise<string>;
	getIpAddress(): Promise<string | null>;
	/** Fetch a URL from the device shell (no browser CORS). */
	deviceFetchText(url: string): Promise<string>;
	/** Download an APK on the device and install it. */
	installFromUrl(urls: string | string[], opts?: InstallOptions): Promise<void>;
	/** Resolve the latest GitHub release APK URLs for a repo. */
	resolveGithubLatest(repo: string): Promise<string[]>;
	/** Resolve the latest F-Droid APK URLs for a package. */
	resolveFdroidLatest(packageName: string): Promise<string[]>;
	makeDirectory(path: string): Promise<void>;
	removePath(path: string): Promise<void>;
	/** Write a UTF-8 text file to a device directory. */
	pushText(directory: string, name: string, text: string): Promise<void>;
	/** Push the user-selected photos (if any) and return how many were written. */
	pushUserPhotos(directory: string): Promise<number>;
	getSetting(namespace: SettingsNamespace, key: string): Promise<string>;
	putSetting(
		namespace: SettingsNamespace,
		key: string,
		value: string,
	): Promise<void>;
	dumpLogcat(): Promise<string>;
	clearLogcat(): Promise<void>;
	launchApp(packageName: string): Promise<void>;
	/** Report a step to the panel's progress list. */
	step(id: string, status: StepStatus, detail?: string, code?: string): void;
	/** Free-text log line (shown in the audit view). */
	log(message: string): void;
	sleep(ms: number): Promise<void>;
}

interface FleetInventory {
	serial: string;
	name: string;
	model: string;
	ip: string;
	agentPort: number;
	token: string;
}

interface ProvisionResult {
	fleet: FleetInventory | null;
}

interface ProvisionStatus {
	statusBar: string;
	darkMode: boolean;
	home: string;
	screensaver: string;
	verifier: "disabled" | "enabled";
	installerDialog: "fixed" | "stock";
	osUpdates: "disabled" | "enabled";
	client: "installed" | "not installed";
}

/** The user's answers to the manifest fields, keyed by field key. */
type ProvisionAnswers = Record<string, boolean | string>;

type FieldType = "boolean" | "text" | "select";

/** Gating predicate, ANDed when several keys are present. */
interface FieldCondition {
	/** True when the device API level is below this (e.g. 29 for A9-only). */
	sdkLessThan?: number;
	sdkAtLeast?: number;
	/** True when another field's answer equals `equals` (default true). */
	whenOption?: string;
	equals?: boolean | string;
}

interface ManifestField {
	key: string;
	type: FieldType;
	label?: string;
	hint?: string;
	placeholder?: string;
	default?: boolean | string;
	/** Only shown in OpenPortal's Advanced mode. */
	advanced?: boolean;
	/** Options for a `select` field. */
	choices?: { value: string; label: string }[];
	/** When false, the field is shown but disabled. */
	enabledWhen?: FieldCondition;
	disabledHint?: string;
	/** When false, the field is hidden entirely. */
	showWhen?: FieldCondition;
}

interface ProvisionManifest {
	/** The host API version this program targets. Must be <= the host's. */
	apiVersion?: number;
	name?: string;
	/** Step ids in display order, matching the ids you pass to portal.step(). */
	steps?: string[];
	fields: ManifestField[];
}

/**
 * The exports your program module must provide. `manifest` and `defaultOptions`
 * power the panel form; the rest are the actions OpenPortal runs.
 */
interface ProvisionProgram {
	manifest: ProvisionManifest | (() => ProvisionManifest);
	defaultOptions(portal: Portal): ProvisionAnswers | Promise<ProvisionAnswers>;
	provision(portal: Portal, answers: ProvisionAnswers): Promise<ProvisionResult>;
	restore(portal: Portal): Promise<void>;
	status(portal: Portal): Promise<ProvisionStatus>;
	resetLauncher(portal: Portal): Promise<string>;
}
