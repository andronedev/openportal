import type {
	BrokerToWorker,
	InstallOptions,
	MorpheManifest,
	Portal,
	ProgramContext,
	StepStatus,
	WorkerToBroker,
} from "./types";

const BLOCKED_GLOBALS = [
	"fetch",
	"XMLHttpRequest",
	"WebSocket",
	"importScripts",
	"Worker",
	"SharedWorker",
	"indexedDB",
	"caches",
	"EventSource",
];

for (const name of BLOCKED_GLOBALS) {
	try {
		Object.defineProperty(globalThis, name, {
			value: undefined,
			configurable: false,
			writable: false,
		});
	} catch {}
}

interface WorkerScope {
	postMessage(message: WorkerToBroker): void;
	addEventListener(
		type: "message",
		listener: (event: { data: BrokerToWorker }) => void,
	): void;
}

const scope = self as unknown as WorkerScope;

interface Pending {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	onProgress?: InstallOptions["onProgress"];
}

let nextId = 1;
const pending = new Map<number, Pending>();

function call(method: string, args: unknown[]): Promise<unknown> {
	const id = nextId++;
	return new Promise<unknown>((resolve, reject) => {
		pending.set(id, { resolve, reject });
		scope.postMessage({ kind: "rpc", id, method, args });
	});
}

function callInstall(
	urls: string | string[],
	opts?: InstallOptions,
): Promise<void> {
	const id = nextId++;
	return new Promise<void>((resolve, reject) => {
		pending.set(id, {
			resolve: () => resolve(),
			reject,
			onProgress: opts?.onProgress,
		});
		scope.postMessage({
			kind: "rpc",
			id,
			method: "installFromUrl",
			args: [
				urls,
				{ sha256: opts?.sha256 ?? null, flags: opts?.flags ?? null },
			],
		});
	});
}

function makePortal(sdk: number, cfg: Portal["cfg"]): Portal {
	return {
		sdk,
		cfg,
		shell: (command, opts) =>
			call("shell", [command, opts?.timeoutMs ?? null]) as Promise<{
				stdout: string;
				exitCode: number;
			}>,
		getprop: (key) => call("getprop", [key]) as Promise<string>,
		getIpAddress: () => call("getIpAddress", []) as Promise<string | null>,
		deviceFetchText: (url) => call("deviceFetchText", [url]) as Promise<string>,
		verifyMorpheManifest: (text) =>
			call("verifyMorpheManifest", [text]) as Promise<MorpheManifest>,
		installFromUrl: callInstall,
		resolveGithubLatest: (repo) =>
			call("resolveGithubLatest", [repo]) as Promise<string[]>,
		resolveFdroidLatest: (packageName) =>
			call("resolveFdroidLatest", [packageName]) as Promise<string[]>,
		makeDirectory: (path) => call("makeDirectory", [path]) as Promise<void>,
		removePath: (path) => call("removePath", [path]) as Promise<void>,
		pushText: (directory, name, text) =>
			call("pushText", [directory, name, text]) as Promise<void>,
		pushUserPhotos: (directory) =>
			call("pushUserPhotos", [directory]) as Promise<number>,
		getSetting: (namespace, key) =>
			call("getSetting", [namespace, key]) as Promise<string>,
		putSetting: (namespace, key, value) =>
			call("putSetting", [namespace, key, value]) as Promise<void>,
		dumpLogcat: () => call("dumpLogcat", []) as Promise<string>,
		clearLogcat: () => call("clearLogcat", []) as Promise<void>,
		launchApp: (packageName) =>
			call("launchApp", [packageName]) as Promise<void>,
		step: (id: string, status: StepStatus, detail?: string, code?: string) =>
			scope.postMessage({ kind: "event", event: { id, status, detail, code } }),
		log: (message: string) => scope.postMessage({ kind: "log", message }),
		sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
	};
}

async function invoke(
	mod: Record<string, unknown>,
	ctx: ProgramContext,
	portal: Portal,
): Promise<unknown> {
	if (ctx.entry === "describe") {
		const manifestExport = mod.manifest;
		const manifest =
			typeof manifestExport === "function"
				? await (manifestExport as () => unknown)()
				: manifestExport;
		const defaultsExport = mod.defaultOptions;
		const defaults =
			typeof defaultsExport === "function"
				? await (defaultsExport as (p: Portal) => unknown)(portal)
				: {};
		return { manifest, defaults };
	}
	const fn = mod[ctx.entry];
	if (typeof fn !== "function") {
		throw new Error(`Program has no '${ctx.entry}' export`);
	}
	const run = fn as (p: Portal, answers?: unknown) => unknown;
	return ctx.entry === "provision"
		? await run(portal, ctx.answers)
		: await run(portal);
}

async function runStart(ctx: ProgramContext): Promise<void> {
	try {
		const portal = makePortal(ctx.sdk, ctx.cfg);
		const blobUrl = URL.createObjectURL(
			new Blob([ctx.programCode], { type: "text/javascript" }),
		);
		let mod: Record<string, unknown>;
		try {
			mod = (await import(/* @vite-ignore */ blobUrl)) as Record<
				string,
				unknown
			>;
		} finally {
			URL.revokeObjectURL(blobUrl);
		}
		const value = await invoke(mod, ctx, portal);
		scope.postMessage({ kind: "done", value: value ?? null });
	} catch (err) {
		scope.postMessage({
			kind: "fail",
			message: err instanceof Error ? err.message : String(err),
		});
	}
}

scope.addEventListener("message", (event) => {
	const msg = event.data;
	switch (msg.kind) {
		case "start":
			void runStart(msg.ctx);
			break;
		case "rpcResult": {
			const p = pending.get(msg.id);
			if (p) {
				pending.delete(msg.id);
				p.resolve(msg.value);
			}
			break;
		}
		case "rpcError": {
			const p = pending.get(msg.id);
			if (p) {
				pending.delete(msg.id);
				p.reject(new Error(msg.message));
			}
			break;
		}
		case "rpcProgress": {
			pending.get(msg.id)?.onProgress?.(msg.stage, msg.percent);
			break;
		}
	}
});
