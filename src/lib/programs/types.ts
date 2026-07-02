import type { InstallStage } from "@/lib/adb/install";
import type { MorpheManifest } from "@/lib/catalog/morphe";
import type { ProgramConfig } from "@/lib/programs/config";

export type { InstallStage, MorpheManifest };

/**
 * Major version of the host <-> program contract (the `Portal` surface, the
 * manifest schema, and the entry exports). A program declares the version it
 * targets via `manifest.apiVersion`; the host runs it only when that value is
 * <= PORTAL_API_VERSION, and otherwise falls back to the vendored program.
 * Bump this on any breaking change to the contract.
 */
export const PORTAL_API_VERSION = 1;

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

export interface ProgramResult {
	fleet: FleetInventory | null;
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

export type FieldType = "boolean" | "text" | "select";

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
	enabledWhen?: FieldCondition;
	disabledHint?: string;
	showWhen?: FieldCondition;
}

export interface ProgramManifest {
	apiVersion?: number;
	name?: string;
	fields: ManifestField[];
	steps?: string[];
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

/**
 * Per-run controls for the broker. `signal` aborts the run (terminates the
 * worker); `onCommand` receives each audited device operation; `program` lets
 * the caller reuse an already-loaded program instead of re-fetching it;
 * `photos` are pushed by `pushUserPhotos` and never enter the worker.
 */
export interface ProgramRun {
	signal?: AbortSignal;
	onCommand?: (entry: AuditEntry) => void;
	program?: LoadedProgram;
	photos?: File[];
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

export type SettingsNamespace = "global" | "secure" | "system";

/**
 * The capability surface handed to a provisioning program inside the sandboxed
 * worker. Every method round-trips to the main-thread broker, which holds the
 * live Adb handle, validates the request, and runs it through an `src/lib/adb`
 * wrapper. The worker never sees the Adb handle or the credential store.
 */
export interface Portal {
	readonly sdk: number;
	readonly cfg: ProgramConfig;
	shell(
		command: string,
		opts?: { timeoutMs?: number },
	): Promise<{ stdout: string; exitCode: number }>;
	getprop(key: string): Promise<string>;
	getIpAddress(): Promise<string | null>;
	deviceFetchText(url: string): Promise<string>;
	/**
	 * Verifies a Morphe manifest envelope (Ed25519, against OpenPortal's pinned
	 * key) and returns the parsed manifest. The key and verification stay on the
	 * host: a program can orchestrate a modded-app install but cannot forge one.
	 */
	verifyMorpheManifest(text: string): Promise<MorpheManifest>;
	installFromUrl(urls: string | string[], opts?: InstallOptions): Promise<void>;
	resolveGithubLatest(repo: string): Promise<string[]>;
	resolveFdroidLatest(packageName: string): Promise<string[]>;
	makeDirectory(path: string): Promise<void>;
	removePath(path: string): Promise<void>;
	pushText(directory: string, name: string, text: string): Promise<void>;
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
	step(id: string, status: StepStatus, detail?: string, code?: string): void;
	log(message: string): void;
	sleep(ms: number): Promise<void>;
}

export interface ProgramContext {
	entry: ProgramEntry;
	programCode: string;
	sdk: number;
	cfg: ProgramConfig;
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
	| { kind: "log"; message: string }
	| { kind: "done"; value: unknown }
	| { kind: "fail"; message: string };
