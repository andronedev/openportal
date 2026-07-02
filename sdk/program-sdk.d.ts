// OpenPortal program SDK — type definitions (API v2).
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

/**
 * The launcher config the host loaded for this app, as raw KEY=value strings.
 * Empty for programs that aren't a launcher. Read whichever keys you need.
 */
type ProgramConfig = Record<string, string>;

type StepStatus = "running" | "ok" | "warn" | "skip" | "error";
type InstallStage = "downloading" | "installing" | "done";

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
 * The capability surface. It is deliberately small: `shell` runs any device
 * command (and every command is shown in the user's audit log), and the rest
 * cover what a raw shell can't do cleanly — a verified/staged install, source
 * resolution, and file pushes whose bytes never enter the sandbox. For anything
 * else (settings, getprop, logcat, launching an app, mkdir, …) use `shell`.
 * Paths for file ops must live under /sdcard or /data/local/tmp; URLs must be https.
 */
interface Portal {
	/** Android API level of the connected device (e.g. 28 for A9, 29 for A10). */
	readonly sdk: number;
	/** The launcher config.env as raw KEY=value strings; empty for other programs. */
	readonly cfg: ProgramConfig;
	/** The catalog app this program runs for (package name, display name). */
	readonly app: ProgramApp;
	/** Run a shell command on the device. Every command shows in the audit log. */
	shell(
		command: string,
		opts?: { timeoutMs?: number },
	): Promise<{ stdout: string; exitCode: number }>;
	/** Download an APK on the device and install it (optionally sha256-verified). */
	installFromUrl(urls: string | string[], opts?: InstallOptions): Promise<void>;
	/** Resolve the latest GitHub release APK URLs for a repo (e.g. "owner/name"). */
	resolveGithubLatest(repo: string): Promise<string[]>;
	/** Resolve the latest F-Droid APK URLs for a package. */
	resolveFdroidLatest(packageName: string): Promise<string[]>;
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
	/** Report a step to the panel's progress list. */
	step(id: string, status: StepStatus, detail?: string, code?: string): void;
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
 * code.
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
 * required (with `defaultOptions` to seed the form); `restore` is optional (run
 * to undo the setup, e.g. before uninstall). A config-only program (no device
 * teardown) can export just `manifest`, `defaultOptions`, and `provision`.
 */
interface ProgramModule {
	manifest: ProgramManifest | (() => ProgramManifest);
	defaultOptions(portal: Portal): ProgramAnswers | Promise<ProgramAnswers>;
	provision(portal: Portal, answers: ProgramAnswers): Promise<ProgramResult>;
	restore?(portal: Portal): Promise<void>;
}
