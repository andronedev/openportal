import { Button, ConfirmDialog } from "@/components/ui/primitives";
import {
	type AuditEntry,
	type FieldCondition,
	type FleetInventory,
	type LoadedProgram,
	type ManifestField,
	PORTAL_API_VERSION,
	type ProgramAnswers,
	type ProgramManifest,
	type ProgramStatus,
	type StepEvent,
	describe,
	loadProgram,
	loadVendoredProgram,
	provision,
	readSdk,
	status as readStatus,
	resetLauncher,
	restore,
} from "@/lib/programs";
import {
	type LoadedProgramConfig,
	loadProgramConfig,
} from "@/lib/programs/config";
import { useAppStore } from "@/store/app-store";
import { useDeviceStore } from "@/store/device-store";
import { useUIStore } from "@/store/ui-store";
import {
	AlertTriangle,
	Check,
	ChevronRight,
	CircleX,
	Download,
	ExternalLink,
	Loader2,
	Minus,
	Square,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { SetupPanelProps } from "./registry";

type Phase = "loading" | "review" | "running" | "done";

function evalCondition(
	cond: FieldCondition | undefined,
	sdk: number,
	answers: ProgramAnswers,
): boolean {
	if (!cond) return true;
	if (cond.sdkLessThan !== undefined && !(sdk < cond.sdkLessThan)) return false;
	if (cond.sdkAtLeast !== undefined && !(sdk >= cond.sdkAtLeast)) return false;
	if (cond.whenOption !== undefined) {
		const expected = cond.equals ?? true;
		if (answers[cond.whenOption] !== expected) return false;
	}
	return true;
}

function StepIcon({ status }: { status: StepEvent["status"] }) {
	if (status === "running")
		return <Loader2 className="h-4 w-4 animate-spin text-sky-500" />;
	if (status === "ok") return <Check className="h-4 w-4 text-emerald-500" />;
	if (status === "warn")
		return <AlertTriangle className="h-4 w-4 text-amber-500" />;
	if (status === "error") return <CircleX className="h-4 w-4 text-red-500" />;
	return <Minus className="h-4 w-4 text-muted-foreground" />;
}

export default function SandboxedProgramPanel({
	app,
	onClose,
}: SetupPanelProps) {
	const { t } = useTranslation("apps");
	const spec = app.program?.kind === "sandboxed" ? app.program : null;
	const adb = useDeviceStore((s) => s.adb);
	const advanced = useUIStore((s) => s.mode) === "advanced";
	const refreshInstalled = useAppStore((s) => s.refreshInstalled);
	const refreshDefaultLauncher = useAppStore((s) => s.refreshDefaultLauncher);
	const connect = useDeviceStore((s) => s.connect);
	const deviceState = useDeviceStore((s) => s.state);
	const isInstalled = useAppStore((s) => s.isInstalled(app.packageName));

	const [phase, setPhase] = useState<Phase>("loading");
	const [loaded, setLoaded] = useState<LoadedProgramConfig | null>(null);
	const [program, setProgram] = useState<LoadedProgram | null>(null);
	const [manifest, setManifest] = useState<ProgramManifest | null>(null);
	const [incompatible, setIncompatible] = useState(false);
	const [sdk, setSdk] = useState(99);
	const [deviceStatus, setDeviceStatus] = useState<ProgramStatus | null>(null);
	const [answers, setAnswers] = useState<ProgramAnswers>({});
	const [events, setEvents] = useState<StepEvent[]>([]);
	const [audit, setAudit] = useState<AuditEntry[]>([]);
	const [fleet, setFleet] = useState<FleetInventory | null>(null);
	const [working, setWorking] = useState(false);
	const [mode, setMode] = useState<"provision" | "restore">("provision");
	const [confirmRestore, setConfirmRestore] = useState(false);
	const [resettingLauncher, setResettingLauncher] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		if (!spec) return;
		let cancelled = false;
		(async () => {
			const [config, currentSdk, loadedProgram] = await Promise.all([
				loadProgramConfig(adb, spec.repo),
				adb ? readSdk(adb) : Promise.resolve(99),
				loadProgram(adb, spec, app.id),
			]);
			let prog = loadedProgram;
			let desc = await describe(adb, config.cfg, { program: prog });
			let incompat = false;
			if (
				prog.source === "live" &&
				(desc.manifest.apiVersion ?? 1) > PORTAL_API_VERSION
			) {
				incompat = true;
				prog = loadVendoredProgram(prog.ref);
				desc = await describe(adb, config.cfg, { program: prog });
			}
			let st: ProgramStatus | null = null;
			if (adb) {
				try {
					st = await readStatus(adb, config.cfg, { program: prog });
				} catch {}
			}
			if (cancelled) return;
			setLoaded(config);
			setProgram(prog);
			setManifest(desc.manifest);
			setIncompatible(incompat);
			setSdk(currentSdk);
			setDeviceStatus(st);
			setAnswers(desc.defaults);
			setPhase("review");
		})();
		return () => {
			cancelled = true;
		};
	}, [adb, spec, app.id]);

	const onStep = (event: StepEvent) =>
		setEvents((prev) => {
			const idx = prev.findIndex((e) => e.id === event.id);
			if (idx >= 0) {
				const copy = [...prev];
				copy[idx] = event;
				return copy;
			}
			return [...prev, event];
		});

	const onCommand = (entry: AuditEntry) => setAudit((prev) => [...prev, entry]);

	const runProgram = async () => {
		if (!adb || !loaded || !program) return;
		setMode("provision");
		setEvents([]);
		setAudit([]);
		setFleet(null);
		setWorking(true);
		setPhase("running");
		const controller = new AbortController();
		abortRef.current = controller;
		try {
			const result = await provision(adb, loaded.cfg, answers, onStep, {
				signal: controller.signal,
				onCommand,
				program,
			});
			setFleet(result.fleet);
			await refreshInstalled();
			await refreshDefaultLauncher();
			toast.success(app.name, { description: t("provisioning.done") });
			setPhase("done");
		} catch (err) {
			toast.error(app.name, {
				description: err instanceof Error ? err.message : t("actionFailed"),
			});
			setPhase("done");
		} finally {
			setWorking(false);
			abortRef.current = null;
		}
	};

	const runRestore = async () => {
		if (!adb || !loaded || !program) return;
		setMode("restore");
		setEvents([]);
		setAudit([]);
		setFleet(null);
		setWorking(true);
		setPhase("running");
		const controller = new AbortController();
		abortRef.current = controller;
		try {
			await restore(adb, loaded.cfg, onStep, {
				signal: controller.signal,
				onCommand,
				program,
			});
			await refreshInstalled();
			await refreshDefaultLauncher();
			toast.success(app.name, { description: t("provisioning.restoreDone") });
			setPhase("done");
		} catch (err) {
			toast.error(app.name, {
				description: err instanceof Error ? err.message : t("actionFailed"),
			});
			setPhase("done");
		} finally {
			setWorking(false);
			abortRef.current = null;
		}
	};

	const handleResetLauncher = async () => {
		if (!adb || !loaded) return;
		setResettingLauncher(true);
		try {
			await resetLauncher(adb, loaded.cfg, program ? { program } : undefined);
			const st = await readStatus(
				adb,
				loaded.cfg,
				program ? { program } : undefined,
			).catch(() => null);
			setDeviceStatus(st);
			await refreshDefaultLauncher();
			toast.success(app.name, {
				description: t("provisioning.resetLauncherDone"),
			});
		} catch (err) {
			toast.error(app.name, {
				description: err instanceof Error ? err.message : t("actionFailed"),
			});
		} finally {
			setResettingLauncher(false);
		}
	};

	const downloadFleet = () => {
		if (!fleet) return;
		const blob = new Blob([JSON.stringify(fleet, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${fleet.serial || "device"}.json`;
		a.click();
		URL.revokeObjectURL(url);
	};

	if (phase === "loading" || !loaded || !program || !manifest) {
		return (
			<div className="flex justify-center py-8">
				<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (phase === "running" || phase === "done") {
		const orderedIds =
			mode === "provision"
				? (manifest.steps ?? events.map((e) => e.id))
				: events.map((e) => e.id);
		const seen = new Set(events.map((e) => e.id));
		const display =
			mode === "provision"
				? events
						.slice()
						.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id))
				: events;
		return (
			<div className="flex flex-col gap-4">
				{phase === "running" && working && (
					<div className="flex justify-end">
						<Button
							variant="secondary"
							onClick={() => abortRef.current?.abort()}
						>
							<Square className="h-4 w-4" />
							{t("provisioning.stop")}
						</Button>
					</div>
				)}
				<ul className="flex flex-col gap-1.5">
					{display.map((e) => (
						<li key={e.id} className="flex items-start gap-2.5 text-sm">
							<span className="mt-0.5">
								<StepIcon status={e.status} />
							</span>
							<span className="flex flex-1 flex-col">
								<span
									className={
										e.status === "skip"
											? "text-muted-foreground"
											: "text-foreground"
									}
								>
									{t(`provisioning.steps.${e.id}`, e.id)}
								</span>
								{e.code && (
									<span className="text-xs text-amber-500">
										{t(`provisioning.msgs.${e.code}`, "")}
									</span>
								)}
								{e.detail && (
									<span className="break-all font-mono text-[11px] text-muted-foreground">
										{e.detail}
									</span>
								)}
							</span>
						</li>
					))}
					{phase === "running" && seen.size === 0 && (
						<li className="text-sm text-muted-foreground">
							{t("provisioning.running")}
						</li>
					)}
				</ul>

				{audit.length > 0 && (
					<details className="group rounded-lg border border-border bg-background/50 text-xs">
						<summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground">
							<span className="flex-1">
								{t("provisioning.auditTitle", { count: audit.length })}
							</span>
							<ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
						</summary>
						<ul className="max-h-48 overflow-y-auto border-t border-border p-2 font-mono text-[11px] text-muted-foreground">
							{audit.map((entry, i) => (
								<li key={`${i}-${entry.method}`} className="break-all">
									<span className="text-sky-500">{entry.method}</span>{" "}
									{entry.detail}
								</li>
							))}
						</ul>
					</details>
				)}

				{phase === "done" && fleet && (
					<div className="rounded-lg border border-border bg-background/50 p-3">
						<p className="mb-2 text-xs text-muted-foreground">
							{t("provisioning.fleetDownloadHint")}
						</p>
						<Button variant="secondary" onClick={downloadFleet}>
							<Download className="h-4 w-4" />
							{t("provisioning.fleetDownload")}
						</Button>
					</div>
				)}

				{phase === "done" && (
					<div className="flex justify-end">
						<Button variant="primary" onClick={onClose}>
							{t("provisioning.close")}
						</Button>
					</div>
				)}
			</div>
		);
	}

	const cfg = loaded.cfg;
	const connecting =
		deviceState === "connecting" || deviceState === "authenticating";

	const setAnswer = (key: string, value: boolean | string) =>
		setAnswers((prev) => ({ ...prev, [key]: value }));

	const renderField = (f: ManifestField) => {
		const enabled = evalCondition(f.enabledWhen, sdk, answers);
		const label = t(`provisioning.opt.${f.key}`, f.label ?? f.key);
		const hint = enabled
			? t(`provisioning.opt.${f.key}Hint`, f.hint ?? "")
			: t(`provisioning.opt.${f.key}Disabled`, f.disabledHint ?? f.hint ?? "");
		if (f.type === "boolean") {
			return (
				<OptionToggle
					key={f.key}
					checked={answers[f.key] === true}
					disabled={!enabled}
					onChange={(v) => setAnswer(f.key, v)}
					label={label}
					hint={hint}
				/>
			);
		}
		const value = answers[f.key];
		const text = typeof value === "string" ? value : "";
		return (
			<div key={f.key} className="flex flex-col gap-1 px-2 py-1.5">
				<span className="text-sm font-medium">{label}</span>
				{hint && <span className="text-xs text-muted-foreground">{hint}</span>}
				{f.type === "select" ? (
					<select
						aria-label={label}
						value={text}
						disabled={!enabled}
						onChange={(e) => setAnswer(f.key, e.target.value)}
						className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
					>
						{(f.choices ?? []).map((c) => (
							<option key={c.value} value={c.value}>
								{c.label}
							</option>
						))}
					</select>
				) : (
					<input
						type="text"
						aria-label={label}
						value={text}
						disabled={!enabled}
						onChange={(e) => setAnswer(f.key, e.target.value)}
						placeholder={t(
							`provisioning.opt.${f.key}Placeholder`,
							f.placeholder ?? "",
						)}
						className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
					/>
				)}
			</div>
		);
	};

	const shownFields = manifest.fields.filter((f) =>
		evalCondition(f.showWhen, sdk, answers),
	);
	const mainFields = shownFields.filter((f) => !f.advanced);
	const advancedFields = shownFields.filter((f) => f.advanced);

	return (
		<div className="flex flex-col gap-4">
			<p className="text-muted-foreground">{t("provisioning.intro")}</p>

			<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
				<span className="rounded-full bg-secondary px-2 py-0.5 font-medium">
					{loaded.source === "live"
						? t("provisioning.sourceLive", { ref: loaded.ref })
						: t("provisioning.sourceVendored", { ref: loaded.ref })}
				</span>
				<a
					href={
						program.source === "live"
							? `https://github.com/${cfg.releaseRepo}/blob/${program.ref}/provisioning/openportal.program.js`
							: `https://github.com/${cfg.releaseRepo}/blob/${program.ref}/provisioning/provision.sh`
					}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-1.5 font-medium text-sky-500 hover:underline"
				>
					<ExternalLink className="h-3.5 w-3.5" />
					{program.source === "live"
						? t("provisioning.viewProgram")
						: t("provisioning.viewSource")}
				</a>
			</div>

			{incompatible && (
				<p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
					{t("provisioning.incompatible")}
				</p>
			)}

			{deviceStatus && (
				<div className="rounded-lg border border-border bg-background/50 p-3 text-xs">
					<div className="grid grid-cols-2 gap-x-4 gap-y-1">
						<StatusRow
							label={t("provisioning.status.client")}
							value={t(
								deviceStatus.client === "installed"
									? "provisioning.status.installed"
									: "provisioning.status.notInstalled",
							)}
						/>
						<StatusRow
							label={t("provisioning.status.verifier")}
							value={t(
								deviceStatus.verifier === "disabled"
									? "provisioning.status.disabled"
									: "provisioning.status.enabled",
							)}
						/>
						<StatusRow
							label={t("provisioning.status.home")}
							value={deviceStatus.home || "-"}
						/>
						<StatusRow
							label={t("provisioning.status.osUpdates")}
							value={t(
								deviceStatus.osUpdates === "disabled"
									? "provisioning.status.disabled"
									: "provisioning.status.enabled",
							)}
						/>
					</div>
				</div>
			)}

			{deviceStatus?.home === cfg.pkg && (
				<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/50 p-3 text-xs">
					<span className="text-muted-foreground">
						{t("provisioning.resetLauncherHint")}
					</span>
					<Button
						variant="secondary"
						onClick={handleResetLauncher}
						disabled={working || resettingLauncher}
						loading={resettingLauncher}
					>
						{t("provisioning.resetLauncher")}
					</Button>
				</div>
			)}

			{advanced && advancedFields.length > 0 && (
				<details className="group rounded-lg border border-border bg-background/50 text-xs">
					<summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground">
						<span className="flex-1">{t("provisioning.optionsTitle")}</span>
						<ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
					</summary>
					<div className="flex flex-col gap-1 border-t border-border p-2">
						{advancedFields.map(renderField)}
					</div>
				</details>
			)}

			{mainFields.length > 0 && (
				<div className="rounded-lg border border-border bg-background/50 p-1">
					{mainFields.map(renderField)}
				</div>
			)}

			<div className="sticky bottom-0 -mx-5 -mb-4 flex items-center justify-between gap-2 border-t border-border bg-card px-5 py-3">
				{!adb ? (
					<Button
						variant="primary"
						className="flex-1"
						onClick={() => connect()}
						loading={connecting}
						disabled={connecting}
					>
						{t("provisioning.connect")}
					</Button>
				) : isInstalled ? (
					<>
						<Button
							variant="danger"
							onClick={() => setConfirmRestore(true)}
							disabled={working}
						>
							{t("provisioning.restore")}
						</Button>
						<Button variant="primary" onClick={runProgram} disabled={working}>
							{t("provisioning.provision")}
						</Button>
					</>
				) : (
					<Button
						variant="primary"
						className="flex-1"
						onClick={runProgram}
						disabled={working}
					>
						{t("installAndConfigure")}
					</Button>
				)}
			</div>

			<ConfirmDialog
				open={confirmRestore}
				onClose={() => setConfirmRestore(false)}
				onConfirm={runRestore}
				title={t("provisioning.restoreConfirmTitle")}
				message={t("provisioning.restoreConfirmMsg")}
				confirmLabel={t("provisioning.restore")}
				danger
			/>
		</div>
	);
}

function StatusRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-2">
			<span className="text-muted-foreground">{label}</span>
			<span className="truncate font-medium">{value}</span>
		</div>
	);
}

function OptionToggle({
	checked,
	onChange,
	label,
	hint,
	disabled,
}: {
	checked: boolean;
	onChange: (value: boolean) => void;
	label: string;
	hint: string;
	disabled?: boolean;
}) {
	return (
		<label
			className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent/40 ${
				disabled ? "opacity-50" : ""
			}`}
		>
			<input
				type="checkbox"
				checked={checked}
				disabled={disabled}
				onChange={(e) => onChange(e.target.checked)}
				className="mt-0.5 h-4 w-4 shrink-0 accent-sky-500"
			/>
			<span className="flex flex-col gap-0.5">
				<span className="text-sm font-medium">{label}</span>
				{hint && <span className="text-xs text-muted-foreground">{hint}</span>}
			</span>
		</label>
	);
}
