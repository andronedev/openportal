import type { InstallStage } from "@/lib/adb/install";
import type { ProgramConfig } from "@/lib/programs/config";

export type { InstallStage };

/**
 * Major version of the host <-> program contract (the `Portal` surface, the
 * manifest schema, and the entry exports). A program declares the version it
 * targets via `manifest.apiVersion`; the host runs it only when that value is
 * <= PORTAL_API_VERSION, and otherwise falls back to the vendored program.
 * Bump this on any breaking change to the contract.
 *
 * v2: dropped the device-utility wrappers that a single `shell(...)` reproduces
 * (getprop, settings, logcat, mkdir, launch, …) and the Morphe-specific
 * `verifyMorpheManifest` (Morphe now runs host-side). The surface is a general
 * core: `shell`, `installFromUrl`, the source resolvers, the file pushes, `step`.
 */
export const PORTAL_API_VERSION = 2;

export type StepStatus = "running" | "ok" | "warn" | "skip" | "error";

export interface StepEvent {
	id: string;
	status: StepStatus;
	detail?: string;
	code?: string;
}

export type OnStep = (event: StepEvent) => void;

export interface FleetInventory {
	serial: string;
	name: string;
	model: string;
	ip: string;
	agentPort: number;
	token: string;
}

/**
 * Optional display a program returns from `provision()` for the panel to render.
 * All of it is untrusted and normalized by the broker before it reaches the UI:
 * `links[].url` is validated as an http(s) URL, `text` is length-capped, and
 * `download.json` is serialized defensively. Additive: immortal's `fleet` path is
 * untouched, so its frozen live contract keeps working.
 */
export interface ResultView {
	links?: { label: string; url: string; copy?: boolean }[];
	text?: string;
	download?: { name: string; json: unknown };
}

export interface ProgramResult {
	fleet: FleetInventory | null;
	view?: ResultView;
}

export interface ProgramStatus {
	statusBar: string;
	darkMode: boolean;
	home: string;
	screensaver: string;
	verifier: "disabled" | "enabled";
	installerDialog: "fixed" | "stock";
	osUpdates: "disabled" | "enabled";
	client: "installed" | "not installed";
}

/**
 * The panel form is driven entirely by the program's manifest, so the founder
 * can add a new question by declaring a field, with no front-end change.
 * Answers are a flat map keyed by field key; `provision()` reads them.
 */
export type ProgramAnswers = Record<string, boolean | string>;

export type FieldType = "boolean" | "text" | "select" | "file";

/** Declarative gating predicate, ANDed when several keys are present. */
export interface FieldCondition {
	sdkLessThan?: number;
	sdkAtLeast?: number;
	whenOption?: string;
	equals?: boolean | string;
}

export interface ManifestField {
	key: string;
	type: FieldType;
	label?: string;
	hint?: string;
	placeholder?: string;
	default?: boolean | string;
	advanced?: boolean;
	choices?: { value: string; label: string }[];
	/** For `type: "file"`: the file input's `accept` attribute (e.g. ".json"). */
	accept?: string;
	enabledWhen?: FieldCondition;
	disabledHint?: string;
	showWhen?: FieldCondition;
}

/**
 * Static presentation a program can declare for the panel: an intro line, a
 * numbered how-to list, and one external link. Lets a program render guidance
 * (what a bespoke React panel used to hard-code) without shipping any UI code.
 */
export interface ProgramPresentation {
	intro?: string;
	steps?: string[];
	link?: { label: string; url: string };
}

export interface ProgramManifest {
	apiVersion?: number;
	name?: string;
	fields: ManifestField[];
	steps?: string[];
	presentation?: ProgramPresentation;
}

export interface ProgramDescription {
	manifest: ProgramManifest;
	defaults: ProgramAnswers;
}

export type ProgramEntry =
	| "describe"
	| "status"
	| "provision"
	| "restore"
	| "resetLauncher";

/** One executed device operation, surfaced to the panel's audit log. */
export interface AuditEntry {
	method: string;
	detail: string;
}

/** Minimal identity of the catalog app a program is running for. */
export interface ProgramApp {
	packageName: string;
	name: string;
}

/**
 * Per-run controls for the broker. `signal` aborts the run (terminates the
 * worker); `onCommand` receives each audited device operation; `program` lets
 * the caller reuse an already-loaded program instead of re-fetching it; `app`
 * identifies the catalog app (surfaced as `portal.app`); `photos` and `files`
 * are pushed on the main thread and never enter the worker.
 */
export interface ProgramRun {
	signal?: AbortSignal;
	onCommand?: (entry: AuditEntry) => void;
	program?: LoadedProgram;
	app?: ProgramApp;
	photos?: File[];
	files?: Record<string, File>;
}

export interface LoadedProgram {
	code: string;
	ref: string;
	source: "live" | "vendored";
}

export interface InstallOptions {
	sha256?: string;
	flags?: string;
	onProgress?: (stage: InstallStage, percent: number | null) => void;
}

/**
 * The capability surface handed to a provisioning program inside the sandboxed
 * worker. Every method round-trips to the main-thread broker, which holds the
 * live Adb handle, validates the request, and runs it through an `src/lib/adb`
 * wrapper. The worker never sees the Adb handle or the credential store.
 *
 * The surface is deliberately small: `shell` is the escape hatch (any device
 * command a program needs), and the rest are the things a raw shell can't do
 * cleanly — a verified/staged install, source resolution, and file pushes whose
 * bytes never enter the worker. There are no thin wrappers over single shell
 * commands (getprop, settings, logcat, mkdir, launch, …); use `shell` for those.
 */
export interface Portal {
	readonly sdk: number;
	readonly cfg: ProgramConfig;
	/** The catalog app this program runs for (package name, display name). */
	readonly app: ProgramApp;
	shell(
		command: string,
		opts?: { timeoutMs?: number },
	): Promise<{ stdout: string; exitCode: number }>;
	installFromUrl(urls: string | string[], opts?: InstallOptions): Promise<void>;
	resolveGithubLatest(repo: string): Promise<string[]>;
	resolveFdroidLatest(packageName: string): Promise<string[]>;
	pushText(directory: string, name: string, text: string): Promise<void>;
	pushUserPhotos(directory: string): Promise<number>;
	/**
	 * Pushes a file the user picked in a `file` manifest field, by that field's
	 * key, to `directory/name`. The bytes stay on the main thread (held in the
	 * run, like photos) and never enter the worker, so a program can place a
	 * user's credential file without ever seeing its contents.
	 */
	pushUploadedFile(
		field: string,
		directory: string,
		name: string,
	): Promise<void>;
	step(id: string, status: StepStatus, detail?: string, code?: string): void;
}

export interface ProgramContext {
	entry: ProgramEntry;
	programCode: string;
	sdk: number;
	cfg: ProgramConfig;
	app: ProgramApp;
	answers: ProgramAnswers | null;
}

export type BrokerToWorker =
	| { kind: "start"; ctx: ProgramContext }
	| { kind: "rpcResult"; id: number; value: unknown }
	| { kind: "rpcError"; id: number; message: string }
	| {
			kind: "rpcProgress";
			id: number;
			stage: InstallStage;
			percent: number | null;
	  };

export type WorkerToBroker =
	| { kind: "rpc"; id: number; method: string; args: unknown[] }
	| { kind: "event"; event: StepEvent }
	| { kind: "done"; value: unknown }
	| { kind: "fail"; message: string };
