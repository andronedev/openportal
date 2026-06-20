import { ConfirmDialog } from "@/components/ui/primitives";
import { type CatalogApp, getAppIconUrl } from "@/lib/portal/catalog";
import { canAutoInstall } from "@/lib/portal/sources";
import { useAppStore } from "@/store/app-store";
import {
	ArrowUpCircle,
	Check,
	Download,
	ExternalLink,
	Loader2,
	Puzzle,
	Settings,
	Sparkles,
	SquareArrowOutUpRight,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { AppBadge } from "./AppBadge";
import { AppIcon } from "./AppIcon";
import { InstallProgress } from "./InstallProgress";
import { SetupConfirmDialog } from "./SetupConfirmDialog";
import { AppSetupPanel } from "./setup/AppSetupPanel";
import { useAppActions } from "./use-app-actions";

const ICON_BUTTON =
	"rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export function AppCard({ app }: { app: CatalogApp }) {
	const { t } = useTranslation("apps");
	const actions = useAppActions(app.packageName, app.name);
	const isDefaultLauncher = useAppStore(
		(s) => s.defaultLauncher === app.packageName,
	);

	const [confirmUninstall, setConfirmUninstall] = useState(false);
	const [setupOpen, setSetupOpen] = useState(false);
	const [confirmSetup, setConfirmSetup] = useState(false);

	const isLauncher = app.category === "launcher";
	const setup = app.setup;
	const autoSetup = setup?.kind === "commands" && setup.auto === true;
	const installViaPanel =
		setup?.kind === "custom" && setup.handlesInstall === true;
	const revertOnUninstall =
		setup?.kind === "custom" && setup.revertOnUninstall === true;
	const showSetupGear =
		actions.isInstalled &&
		!actions.hasUpdate &&
		!!setup &&
		(setup.kind === "custom" || !(isLauncher && isDefaultLauncher));

	const handleSetup = () => {
		if (!setup) return;
		if (setup.kind === "custom") setSetupOpen(true);
		else actions.runSetup();
	};

	return (
		<div className="flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/30">
			<Link
				to={`/apps/${app.packageName}`}
				title={t("viewDetails")}
				className="group flex items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<AppIcon
					name={app.name}
					iconUrl={getAppIconUrl(app)}
					className="h-14 w-14 shrink-0 rounded-2xl"
				/>
				<div className="min-w-0 flex-1">
					<h4 className="truncate text-sm font-semibold group-hover:underline">
						{app.name}
					</h4>
					<div className="mt-1 flex flex-wrap gap-1">
						{app.madeForPortal && (
							<AppBadge tone="violet">
								<Sparkles className="h-3 w-3" />
								{t("madeForPortal")}
							</AppBadge>
						)}
						{app.source === "morphe" && (
							<AppBadge tone="sky">
								<Puzzle className="h-3 w-3" />
								{t("moddedForPortal")}
							</AppBadge>
						)}
						{actions.hasUpdate && actions.update && (
							<AppBadge
								tone="amber"
								title={`${actions.update.installedVersion} → ${actions.update.latestVersion}`}
							>
								<ArrowUpCircle className="h-3 w-3" />
								{t("updateAvailable")}
							</AppBadge>
						)}
						{isLauncher && isDefaultLauncher && (
							<AppBadge tone="emerald">
								<Check className="h-3 w-3" />
								{t("defaultLauncher")}
							</AppBadge>
						)}
					</div>
				</div>
			</Link>

			<p className="mt-3 line-clamp-2 min-h-8 text-xs text-muted-foreground">
				{app.description}
			</p>

			<div className="mt-4 flex items-center gap-2">
				{actions.stage ? (
					<InstallProgress stage={actions.stage} percent={actions.progress} />
				) : actions.isInstalled ? (
					<>
						{actions.hasUpdate && actions.update ? (
							<button
								type="button"
								onClick={actions.install}
								title={`${actions.update.installedVersion} → ${actions.update.latestVersion}`}
								className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-medium text-amber-950 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<ArrowUpCircle className="h-3.5 w-3.5" />
								{t("update")}
							</button>
						) : (
							<span className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-500">
								<Check className="h-3.5 w-3.5" />
								{t("installed")}
							</span>
						)}
						{showSetupGear && setup && (
							<button
								type="button"
								onClick={handleSetup}
								disabled={actions.busy === "setup"}
								title={t(setup.labelKey ?? "runSetup")}
								aria-label={t(setup.labelKey ?? "runSetup")}
								className={ICON_BUTTON}
							>
								{actions.busy === "setup" ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Settings className="h-4 w-4" />
								)}
							</button>
						)}
						<button
							type="button"
							onClick={actions.open}
							title={t("openApp")}
							aria-label={t("openApp")}
							className={ICON_BUTTON}
						>
							<SquareArrowOutUpRight className="h-4 w-4" />
						</button>
						<button
							type="button"
							onClick={() => setConfirmUninstall(true)}
							disabled={actions.busy === "uninstall"}
							title={t("uninstall")}
							aria-label={t("uninstall")}
							className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
						>
							{actions.busy === "uninstall" ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Trash2 className="h-4 w-4" />
							)}
						</button>
					</>
				) : canAutoInstall(app) ? (
					<button
						type="button"
						onClick={
							installViaPanel
								? () => setSetupOpen(true)
								: autoSetup
									? () => setConfirmSetup(true)
									: actions.install
						}
						className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<Download className="h-3.5 w-3.5" />
						{t(
							installViaPanel || autoSetup ? "installAndConfigure" : "install",
						)}
					</button>
				) : (
					app.downloadUrl && (
						<a
							href={app.downloadUrl}
							target="_blank"
							rel="noreferrer"
							className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<ExternalLink className="h-3.5 w-3.5" />
							{t("openPage")}
						</a>
					)
				)}
			</div>

			<ConfirmDialog
				open={confirmUninstall}
				onClose={() => setConfirmUninstall(false)}
				onConfirm={actions.uninstall}
				title={t("uninstall")}
				message={
					revertOnUninstall
						? t("uninstallRevertConfirm", { name: app.name })
						: t("uninstallConfirm", { name: app.name })
				}
				confirmLabel={t("uninstall")}
				danger
			/>

			<AppSetupPanel
				app={app}
				open={setupOpen}
				onClose={() => setSetupOpen(false)}
			/>

			<SetupConfirmDialog
				app={app}
				open={confirmSetup}
				onClose={() => setConfirmSetup(false)}
				onConfirm={actions.install}
				onInstallOnly={actions.installWithoutSetup}
			/>
		</div>
	);
}
