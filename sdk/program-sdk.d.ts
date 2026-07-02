// OpenPortal program SDK — type definitions (API v1).
//
// These types describe the contract between OpenPortal (the host) and a setup
// program. Reference this file from your program to get editor autocomplete and
// type-checking with no build step:
//
//   /// <reference path="./program-sdk.d.ts" />
//   /** @param {Portal} portal */
//   export async function provision(portal, answers) { ... }
//
// Your program runs inside a sandboxed Web Worker. It has no DOM, no network
// (fetch/XHR/WebSocket are removed), and no access to the device except through
// the `portal` object below. Every `portal` call is validated by the host on
// the main thread, where the live ADB connection lives.

/** A live, allowlist-validated view of a launcher's config.env (Immortal-shaped). */
interface ProgramConfig {
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

interface MorpheManifestApp {
	id: string;
	packageName: string;
	version: string;
	arch?: string;
	sha256: string;
	size?: number;
	urls: string[];
}

interface MorpheManifest {
	version: number;
	generatedAt: string;
	apps: MorpheManifestApp[];
}

interface InstallOptions {
	/** If set, the host verifies the downloaded APK's sha256 on the device. */
	sha256?: string;
	/** Flags passed to `pm install` (default "-r"). Must match /^[-a-zA-Z0-9 ]*$/. */
	flags?: string;
	onProgress?: (stage: InstallStage, percent: number | null) => void;
}

/** Identity of the catalog app your program runs for. */
interface ProgramApp {
	packageName: string;
	name: string;
}

/**
 * The capability surface. Paths for file ops must live under /sdcard or
 * /data/local/tmp. URLs must be https. `shell` runs raw, but every command is
 * shown in the user's audit log.
 */
interface Portal {
	/** Android API level of the connected device (e.g. 28 for A9, 29 for A10). */
	readonly sdk: number;
	/** A launcher's config.env (Immortal-shaped); empty for other programs. */
	readonly cfg: ProgramConfig;
	/** The catalog app this program runs for (package name, display name). */
	readonly app: ProgramApp;
	shell(
		command: string,
		opts?: { timeoutMs?: number },
	): Promise<{ stdout: string; exitCode: number }>;
	getprop(key: string): Promise<string>;
	getIpAddress(): Promise<string | null>;
	/** Fetch a URL from the device shell (no browser CORS). */
	deviceFetchText(url: string): Promise<string>;
	/**
	 * Verify a Morphe manifest envelope (Ed25519, against OpenPortal's pinned
	 * key) and return the parsed manifest. The key and verification stay on the
	 * host: a program can orchestrate a modded-app install but cannot forge one.
	 */
	verifyMorpheManifest(text: string): Promise<MorpheManifest>;
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
	/**
	 * Push the file the user picked in a `file` manifest field (by its key) to
	 * `directory/name`. The bytes stay on the host and never enter the worker, so
	 * you can place a user's credential file without ever reading it.
	 */
	pushUploadedFile(field: string, directory: string, name: string): Promise<void>;
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

/**
 * Optional content your `provision()` can return for the panel to render: LAN or
 * web links (with an optional copy button), a text block, and a downloadable
 * JSON file. The host validates it (links must be http(s)) before display.
 */
interface ResultView {
	links?: { label: string; url: string; copy?: boolean }[];
	text?: string;
	download?: { name: string; json: unknown };
}

interface ProgramResult {
	fleet: FleetInventory | null;
	view?: ResultView;
}

interface ProgramStatus {
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
type ProgramAnswers = Record<string, boolean | string>;

type FieldType = "boolean" | "text" | "select" | "file";

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
	/** For a `file` field: the file input's `accept` attribute (e.g. ".json"). */
	accept?: string;
	/** When false, the field is shown but disabled. */
	enabledWhen?: FieldCondition;
	disabledHint?: string;
	/** When false, the field is hidden entirely. */
	showWhen?: FieldCondition;
}

/**
 * Static guidance the panel renders above the form: an intro line, a numbered
 * how-to, and one external link. Lets a program show instructions without any UI
 * code (what a bespoke React panel used to hard-code).
 */
interface ProgramPresentation {
	intro?: string;
	steps?: string[];
	link?: { label: string; url: string };
}

interface ProgramManifest {
	/** The host API version this program targets. Must be <= the host's. */
	apiVersion?: number;
	name?: string;
	/** Step ids in display order, matching the ids you pass to portal.step(). */
	steps?: string[];
	fields: ManifestField[];
	presentation?: ProgramPresentation;
}

/**
 * The exports your program module provides. `manifest` and `provision` are
 * required (with `defaultOptions` to seed the form); `restore`, `status`, and
 * `resetLauncher` are optional. A config-only program (no device teardown, no
 * launcher) can export just `manifest`, `defaultOptions`, and `provision`.
 */
interface ProgramModule {
	manifest: ProgramManifest | (() => ProgramManifest);
	defaultOptions(portal: Portal): ProgramAnswers | Promise<ProgramAnswers>;
	provision(portal: Portal, answers: ProgramAnswers): Promise<ProgramResult>;
	restore?(portal: Portal): Promise<void>;
	status?(portal: Portal): Promise<ProgramStatus>;
	resetLauncher?(portal: Portal): Promise<string>;
}
