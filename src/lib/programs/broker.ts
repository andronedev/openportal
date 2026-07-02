import { makeDirectory, pushFile } from "@/lib/adb/file-system";
import { installApp } from "@/lib/adb/install";
import { execShell, getprop } from "@/lib/adb/shell";
import {
	resolveFdroidLatest,
	resolveGithubLatest,
} from "@/lib/catalog/sources";
import type { ProgramConfig } from "@/lib/programs/config";
import type { Adb } from "@yume-chan/adb";
import { loadVendoredProgram } from "./loader";
import type {
	InstallStage,
	ManifestField,
	OnStep,
	ProgramAnswers,
	ProgramContext,
	ProgramDescription,
	ProgramEntry,
	ProgramPresentation,
	ProgramResult,
	ProgramRun,
	ProgramStatus,
	ResultView,
	WorkerToBroker,
} from "./types";

const WORKER_TIMEOUT_MS = 20 * 60 * 1000;
const HTTPS_UNSAFE = /[\s"'`$;|&<>(){}\\]/;
const FLAGS_RE = /^[-a-zA-Z0-9 ]*$/;
const DEVICE_ROOTS = ["/sdcard/", "/data/local/tmp/"];

export async function readSdk(adb: Adb): Promise<number> {
	const value = (await getprop(adb, "ro.build.version.sdk")).trim();
	const n = Number.parseInt(value, 10);
	return Number.isFinite(n) ? n : 99;
}

function reqString(value: unknown, label: string): string {
	if (typeof value !== "string") throw new Error(`Expected ${label} string`);
	return value;
}

function reqHttpsUrl(value: unknown): string {
	const url = reqString(value, "url");
	if (!url.startsWith("https://") || HTTPS_UNSAFE.test(url)) {
		throw new Error(`Unsafe URL: ${url}`);
	}
	try {
		new URL(url);
	} catch {
		throw new Error(`Invalid URL: ${url}`);
	}
	return url;
}

function reqUrlList(value: unknown): string[] {
	const list = Array.isArray(value) ? value : [value];
	const urls = list.map((u) => reqHttpsUrl(u));
	if (urls.length === 0) throw new Error("No download URL");
	return urls;
}

function reqInstallFlags(value: unknown): string {
	if (value == null) return "-r";
	const flags = reqString(value, "flags");
	if (!FLAGS_RE.test(flags)) throw new Error(`Unsafe install flags: ${flags}`);
	return flags;
}

function reqDevicePath(value: unknown): string {
	const path = reqString(value, "path");
	if (path === "/sdcard") return path;
	if (path.includes("..") || !DEVICE_ROOTS.some((r) => path.startsWith(r))) {
		throw new Error(`Path outside allowed roots: ${path}`);
	}
	return path;
}

function reqFileName(value: unknown): string {
	const name = reqString(value, "name");
	if (name.length === 0 || name.includes("/") || name.includes("..")) {
		throw new Error(`Unsafe file name: ${name}`);
	}
	return name;
}

/**
 * A URL safe to render as an `<a href>` in the panel: http(s) only, so a program
 * cannot return a `javascript:`/`data:` link. Distinct from `reqHttpsUrl` (which
 * is https-only, for device fetches) because result links may be LAN `http://`.
 */
function safeExternalUrl(value: unknown): string | null {
	if (typeof value !== "string") return null;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	return url.protocol === "http:" || url.protocol === "https:" ? value : null;
}

async function pushUserPhotos(
	adb: Adb,
	directory: string,
	photos: File[] | undefined,
): Promise<number> {
	if (!photos || photos.length === 0) return 0;
	await makeDirectory(adb, directory).catch(() => {});
	let n = 0;
	for (let i = 0; i < photos.length; i++) {
		const photo = photos[i];
		if (!photo) continue;
		const file =
			i === 0 ? new File([photo], "frame.jpg", { type: photo.type }) : photo;
		try {
			await pushFile(adb, directory, file);
			n++;
		} catch {}
	}
	return n;
}

async function pushUploadedFile(
	adb: Adb,
	field: string,
	directory: string,
	name: string,
	files: Record<string, File> | undefined,
): Promise<void> {
	const file = files?.[field];
	if (!file) throw new Error(`No uploaded file for field: ${field}`);
	await makeDirectory(adb, directory).catch(() => {});
	await pushFile(adb, directory, new File([file], name, { type: file.type }));
}

async function dispatch(
	adb: Adb,
	run: ProgramRun | undefined,
	method: string,
	args: unknown[],
	onProgress: (stage: InstallStage, percent: number | null) => void,
): Promise<unknown> {
	const audit = (detail: string) => run?.onCommand?.({ method, detail });
	switch (method) {
		case "shell": {
			const command = reqString(args[0], "command");
			const timeoutMs = typeof args[1] === "number" ? args[1] : undefined;
			audit(command);
			return execShell(adb, command, timeoutMs != null ? { timeoutMs } : {});
		}
		case "installFromUrl": {
			const urls = reqUrlList(args[0]);
			const opts = args[1] as
				| { sha256?: string | null; flags?: string | null }
				| undefined;
			audit(urls.join(" "));
			return installApp(
				adb,
				{ kind: "url", urls, sha256: opts?.sha256 ?? undefined },
				{ flags: reqInstallFlags(opts?.flags), onProgress },
			);
		}
		case "resolveGithubLatest":
			return (await resolveGithubLatest(reqString(args[0], "repo"))).urls;
		case "resolveFdroidLatest":
			return (await resolveFdroidLatest(adb, reqString(args[0], "packageName")))
				.urls;
		case "pushText": {
			const directory = reqDevicePath(args[0]);
			const name = reqFileName(args[1]);
			const text = reqString(args[2], "text");
			audit(`${directory}/${name}`);
			return pushFile(
				adb,
				directory,
				new File([text], name, { type: "text/plain" }),
			);
		}
		case "pushUserPhotos": {
			const directory = reqDevicePath(args[0]);
			audit(directory);
			return pushUserPhotos(adb, directory, run?.photos);
		}
		case "pushUploadedFile": {
			const field = reqString(args[0], "field");
			const directory = reqDevicePath(args[1]);
			const name = reqFileName(args[2]);
			audit(`${directory}/${name}`);
			return pushUploadedFile(adb, field, directory, name, run?.files);
		}
		default:
			throw new Error(`Blocked provisioning method: ${method}`);
	}
}

function spawnWorker(): Worker {
	return new Worker(new URL("./worker.ts", import.meta.url), {
		type: "module",
	});
}

function runEntry(
	adb: Adb | null,
	cfg: ProgramConfig,
	entry: ProgramEntry,
	answers: ProgramAnswers | null,
	onStep: OnStep,
	run: ProgramRun | undefined,
): Promise<unknown> {
	return (async () => {
		const program = run?.program ?? loadVendoredProgram();
		const sdk = adb ? await readSdk(adb) : 99;
		const worker = spawnWorker();
		return new Promise<unknown>((resolve, reject) => {
			let settled = false;
			const onAbort = () =>
				finish(() => reject(new Error("Provisioning aborted")));
			const timer = setTimeout(
				() => finish(() => reject(new Error("Provisioning timed out"))),
				WORKER_TIMEOUT_MS,
			);
			function finish(act: () => void) {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				run?.signal?.removeEventListener("abort", onAbort);
				worker.terminate();
				act();
			}
			if (run?.signal) {
				if (run.signal.aborted) {
					finish(() => reject(new Error("Provisioning aborted")));
					return;
				}
				run.signal.addEventListener("abort", onAbort);
			}
			worker.onerror = (event) =>
				finish(() => reject(new Error(event.message || "Worker crashed")));
			worker.onmessage = (event: MessageEvent<WorkerToBroker>) => {
				const msg = event.data;
				switch (msg.kind) {
					case "rpc": {
						if (!adb) {
							worker.postMessage({
								kind: "rpcError",
								id: msg.id,
								message: "No device connected",
							});
							break;
						}
						dispatch(adb, run, msg.method, msg.args, (stage, percent) =>
							worker.postMessage({
								kind: "rpcProgress",
								id: msg.id,
								stage,
								percent,
							}),
						).then(
							(value) =>
								worker.postMessage({ kind: "rpcResult", id: msg.id, value }),
							(err: unknown) =>
								worker.postMessage({
									kind: "rpcError",
									id: msg.id,
									message: err instanceof Error ? err.message : String(err),
								}),
						);
						break;
					}
					case "event":
						onStep(msg.event);
						break;
					case "done":
						finish(() => resolve(msg.value));
						break;
					case "fail":
						finish(() => reject(new Error(msg.message)));
						break;
				}
			};
			const ctx: ProgramContext = {
				entry,
				programCode: program.code,
				sdk,
				cfg,
				app: run?.app ?? { packageName: "", name: "" },
				answers,
			};
			worker.postMessage({ kind: "start", ctx });
		});
	})();
}

function isManifestField(value: unknown): value is ManifestField {
	if (!value || typeof value !== "object") return false;
	const f = value as Record<string, unknown>;
	return (
		typeof f.key === "string" &&
		(f.type === "boolean" || f.type === "text" || f.type === "select")
	);
}

function normalizePresentation(
	value: unknown,
): ProgramPresentation | undefined {
	if (!value || typeof value !== "object") return undefined;
	const p = value as Record<string, unknown>;
	const out: ProgramPresentation = {};
	if (typeof p.intro === "string") out.intro = p.intro;
	if (Array.isArray(p.steps)) {
		const steps = p.steps.filter((s): s is string => typeof s === "string");
		if (steps.length > 0) out.steps = steps;
	}
	if (p.link && typeof p.link === "object") {
		const l = p.link as Record<string, unknown>;
		const url = safeExternalUrl(l.url);
		if (url && typeof l.label === "string") out.link = { label: l.label, url };
	}
	return out.intro || out.steps || out.link ? out : undefined;
}

const RESULT_TEXT_MAX = 4096;
const RESULT_JSON_MAX = 256_000;

/** Sanitizes the untrusted `view` a program returns before the panel renders it. */
function normalizeResultView(value: unknown): ResultView | undefined {
	if (!value || typeof value !== "object") return undefined;
	const v = value as Record<string, unknown>;
	const out: ResultView = {};
	if (Array.isArray(v.links)) {
		const links = v.links
			.map((raw) => {
				if (!raw || typeof raw !== "object") return null;
				const l = raw as Record<string, unknown>;
				const url = safeExternalUrl(l.url);
				if (!url || typeof l.label !== "string") return null;
				return { label: l.label, url, copy: l.copy === true };
			})
			.filter((l): l is NonNullable<typeof l> => l !== null);
		if (links.length > 0) out.links = links;
	}
	if (typeof v.text === "string") out.text = v.text.slice(0, RESULT_TEXT_MAX);
	if (v.download && typeof v.download === "object") {
		const d = v.download as Record<string, unknown>;
		try {
			const json = JSON.stringify(d.json ?? null);
			if (typeof d.name === "string" && json.length <= RESULT_JSON_MAX) {
				out.download = { name: reqFileName(d.name), json: d.json };
			}
		} catch {}
	}
	return out.links || out.text || out.download ? out : undefined;
}

/** The `fleet` path is immortal's frozen contract, passed through untouched. */
function normalizeResult(value: unknown): ProgramResult {
	const v = (value ?? {}) as Record<string, unknown>;
	const fleet = (v.fleet ?? null) as ProgramResult["fleet"];
	const view = normalizeResultView(v.view);
	return view ? { fleet, view } : { fleet };
}

/** Defensive normalization: the manifest is untrusted remote data rendered in the UI. */
function normalizeDescription(value: unknown): ProgramDescription {
	const v = (value ?? {}) as { manifest?: unknown; defaults?: unknown };
	const m = (v.manifest ?? {}) as Record<string, unknown>;
	const fields = Array.isArray(m.fields)
		? m.fields.filter(isManifestField)
		: [];
	const steps = Array.isArray(m.steps)
		? m.steps.filter((s): s is string => typeof s === "string")
		: undefined;
	const defaults: ProgramAnswers = {};
	if (v.defaults && typeof v.defaults === "object") {
		for (const [key, val] of Object.entries(v.defaults)) {
			if (typeof val === "boolean" || typeof val === "string") {
				defaults[key] = val;
			}
		}
	}
	return {
		manifest: {
			apiVersion: typeof m.apiVersion === "number" ? m.apiVersion : undefined,
			name: typeof m.name === "string" ? m.name : undefined,
			fields,
			steps,
			presentation: normalizePresentation(m.presentation),
		},
		defaults,
	};
}

export async function describe(
	adb: Adb | null,
	cfg: ProgramConfig,
	run?: ProgramRun,
): Promise<ProgramDescription> {
	return normalizeDescription(
		await runEntry(adb, cfg, "describe", null, () => {}, run),
	);
}

export function status(
	adb: Adb,
	cfg: ProgramConfig,
	run?: ProgramRun,
): Promise<ProgramStatus> {
	return runEntry(
		adb,
		cfg,
		"status",
		null,
		() => {},
		run,
	) as Promise<ProgramStatus>;
}

export async function provision(
	adb: Adb,
	cfg: ProgramConfig,
	answers: ProgramAnswers,
	onStep: OnStep,
	run?: ProgramRun,
): Promise<ProgramResult> {
	return normalizeResult(
		await runEntry(adb, cfg, "provision", answers, onStep, run),
	);
}

export function restore(
	adb: Adb,
	cfg: ProgramConfig,
	onStep: OnStep,
	run?: ProgramRun,
): Promise<void> {
	return runEntry(adb, cfg, "restore", null, onStep, run) as Promise<void>;
}

export function resetLauncher(
	adb: Adb,
	cfg: ProgramConfig,
	run?: ProgramRun,
): Promise<string> {
	return runEntry(
		adb,
		cfg,
		"resetLauncher",
		null,
		() => {},
		run,
	) as Promise<string>;
}
