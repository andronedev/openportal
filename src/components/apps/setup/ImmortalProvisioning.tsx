import { Button, ConfirmDialog } from "@/components/ui/primitives";
import {
	type FleetInventory,
	type ProvisionOptions,
	type ProvisionStatus,
	type StepEvent,
	defaultOptions,
	provision,
	readSdk,
	status as readStatus,
	restore,
} from "@/lib/adb/provision";
import {
	type LoadedProvisionConfig,
	loadProvisionConfig,
} from "@/lib/portal/provision-config";
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
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { SetupPanelProps } from "./registry";

type Phase = "loading" | "review" | "running" | "done";

const PROVISION_STEPS = [
	"installClient",
	"startShizuku",
	"installApps",
	"pushAssets",
	"grantPerms",
	"applySystemTweaks",
	"disableVerifier",
	"disableInstallerOverlay",
	"disableOta",
	"disablePresence",
	"snapshotStock",
	"setLauncher",
	"setScreensaver",
	"enableFleet",
	"configureBootApps",
	"restoreAlexa",
	"finish",
];

function StepIcon({ status }: { status: StepEvent["status"] }) {
	if (status === "running")
		return <Loader2 className="h-4 w-4 animate-spin text-sky-500" />;
	if (status === "ok") return <Check className="h-4 w-4 text-emerald-500" />;
	if (status === "warn")
		return <AlertTriangle className="h-4 w-4 text-amber-500" />;
	if (status === "error") return <CircleX className="h-4 w-4 text-red-500" />;
	return <Minus className="h-4 w-4 text-muted-foreground" />;
}

export default function ImmortalProvisioning({
	app,
	onClose,
}: SetupPanelProps) {
	const { t } = useTranslation("apps");
	const adb = useDeviceStore((s) => s.adb);
	const advanced = useUIStore((s) => s.mode) === "advanced";
	const refreshInstalled = useAppStore((s) => s.refreshInstalled);
	const refreshDefaultLauncher = useAppStore((s) => s.refreshDefaultLauncher);
	const connect = useDeviceStore((s) => s.connect);
	const deviceState = useDeviceStore((s) => s.state);
	const isInstalled = useAppStore((s) => s.isInstalled(app.packageName));

	const [phase, setPhase] = useState<Phase>("loading");
	const [loaded, setLoaded] = useState<LoadedProvisionConfig | null>(null);
	const [sdk, setSdk] = useState(99);
	const [deviceStatus, setDeviceStatus] = useState<ProvisionStatus | null>(
		null,
	);
	const [options, setOptions] = useState<ProvisionOptions | null>(null);
	const [events, setEvents] = useState<StepEvent[]>([]);
	const [fleet, setFleet] = useState<FleetInventory | null>(null);
	const [working, setWorking] = useState(false);
	const [mode, setMode] = useState<"provision" | "restore">("provision");
	const [confirmRestore, setConfirmRestore] = useState(false);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const result = await loadProvisionConfig(adb);
			const currentSdk = adb ? await readSdk(adb) : 99;
			let st: ProvisionStatus | null = null;
			if (adb) {
				try {
					st = await readStatus(adb, result.cfg);
				} catch {}
			}
			if (cancelled) return;
			setLoaded(result);
			setSdk(currentSdk);
			setDeviceStatus(st);
			setOptions(defaultOptions(result.cfg, currentSdk));
			setPhase("review");
		})();
		return () => {
			cancelled = true;
		};
	}, [adb]);

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

	const runProvision = async () => {
		if (!adb || !loaded || !options) return;
		setMode("provision");
		setEvents([]);
		setFleet(null);
		setWorking(true);
		setPhase("running");
		try {
			const result = await provision(adb, loaded.cfg, options, onStep);
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
		}
	};

	const runRestore = async () => {
		if (!adb || !loaded) return;
		setMode("restore");
		setEvents([]);
		setFleet(null);
		setWorking(true);
		setPhase("running");
		try {
			await restore(adb, loaded.cfg, onStep);
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

	if (phase === "loading" || !loaded || !options) {
		return (
			<div className="flex justify-center py-8">
				<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (phase === "running" || phase === "done") {
		const orderedIds =
			mode === "provision" ? PROVISION_STEPS : events.map((e) => e.id);
		const seen = new Set(events.map((e) => e.id));
		const display =
			mode === "provision"
				? events
						.slice()
						.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id))
				: events;
		return (
			<div className="flex flex-col gap-4">
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
	const alexaBlocked = sdk >= 29;
	const connecting =
		deviceState === "connecting" || deviceState === "authenticating";

	const set = (patch: Partial<ProvisionOptions>) =>
		setOptions((prev) => (prev ? { ...prev, ...patch } : prev));

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
					href={`https://github.com/${cfg.releaseRepo}/blob/${loaded.ref}/provisioning/provision.sh`}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-1.5 font-medium text-sky-500 hover:underline"
				>
					<ExternalLink className="h-3.5 w-3.5" />
					{t("provisioning.viewSource")}
				</a>
			</div>

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

			{advanced && (
				<details className="group rounded-lg border border-border bg-background/50 text-xs">
					<summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground">
						<span className="flex-1">{t("provisioning.optionsTitle")}</span>
						<ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
					</summary>
					<div className="flex flex-col gap-1 border-t border-border p-2">
						<OptionToggle
							checked={options.disableOta}
							onChange={(v) => set({ disableOta: v })}
							label={t("provisioning.opt.blockOta")}
							hint={t("provisioning.opt.blockOtaHint")}
						/>
						<OptionToggle
							checked={options.installShizuku}
							onChange={(v) => set({ installShizuku: v })}
							label={t("provisioning.opt.installShizuku")}
							hint={t("provisioning.opt.installShizukuHint")}
						/>
						<OptionToggle
							checked={options.runPreinstalls}
							onChange={(v) => set({ runPreinstalls: v })}
							label={t("provisioning.opt.runPreinstalls")}
							hint={t("provisioning.opt.runPreinstallsHint")}
						/>
						<OptionToggle
							checked={options.disablePresence}
							onChange={(v) => set({ disablePresence: v })}
							label={t("provisioning.opt.disablePresence")}
							hint={t("provisioning.opt.disablePresenceHint")}
						/>
						<OptionToggle
							checked={options.enableFleet}
							onChange={(v) => set({ enableFleet: v })}
							label={t("provisioning.opt.enableFleet")}
							hint={t("provisioning.opt.enableFleetHint")}
						/>
						{options.enableFleet && (
							<input
								type="text"
								value={options.fleetName ?? ""}
								onChange={(e) => set({ fleetName: e.target.value })}
								placeholder={t("provisioning.opt.fleetNamePlaceholder")}
								className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
							/>
						)}
					</div>
				</details>
			)}

			<div className="rounded-lg border border-border bg-background/50 p-1">
				<OptionToggle
					checked={options.restoreAlexa}
					disabled={alexaBlocked}
					onChange={(v) => set({ restoreAlexa: v })}
					label={t("provisioning.opt.restoreAlexa")}
					hint={
						alexaBlocked
							? t("provisioning.opt.restoreAlexaA10")
							: t("provisioning.opt.restoreAlexaHint")
					}
				/>
			</div>

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
						<Button variant="primary" onClick={runProvision} disabled={working}>
							{t("provisioning.provision")}
						</Button>
					</>
				) : (
					<Button
						variant="primary"
						className="flex-1"
						onClick={runProvision}
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
				<span className="text-xs text-muted-foreground">{hint}</span>
			</span>
		</label>
	);
}
