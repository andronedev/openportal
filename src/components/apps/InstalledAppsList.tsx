import {
	Button,
	ConfirmDialog,
	EmptyState,
	Segmented,
} from "@/components/ui/primitives";
import { installApp } from "@/lib/adb/install";
import type { InstalledPackage } from "@/lib/adb/types";
import {
	getAppIconUrl,
	getCatalogApp,
	isPanelProgram,
} from "@/lib/portal/catalog";
import { useAppStore } from "@/store/app-store";
import { useDeviceStore } from "@/store/device-store";
import { useUIStore } from "@/store/ui-store";
import {
	ArrowUpCircle,
	Check,
	Loader2,
	Search,
	Settings,
	Sparkles,
	SquareArrowOutUpRight,
	Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { AppBadge } from "./AppBadge";
import { AppIcon } from "./AppIcon";
import { AppSetupPanel } from "./setup/AppSetupPanel";
import { useAppActions } from "./use-app-actions";

type Filter = "all" | "user" | "system";

function displayName(pkg: InstalledPackage): string {
	return getCatalogApp(pkg.packageName)?.name ?? pkg.packageName;
}

export function InstalledAppsList() {
	const { t } = useTranslation("apps");
	const mode = useUIStore((s) => s.mode);
	const adb = useDeviceStore((s) => s.adb);
	const packages = useAppStore((s) => s.installedPackages);
	const loading = useAppStore((s) => s.loading);
	const updates = useAppStore((s) => s.updates);
	const refreshInstalled = useAppStore((s) => s.refreshInstalled);
	const clearUpdate = useAppStore((s) => s.clearUpdate);

	const navigate = useNavigate();
	const advanced = mode === "advanced";
	const [filter, setFilter] = useState<Filter>("user");
	const [search, setSearch] = useState("");
	const [updatingAll, setUpdatingAll] = useState(false);

	const effectiveFilter: Filter = advanced ? filter : "user";

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		return packages
			.filter((pkg) =>
				effectiveFilter === "all"
					? true
					: effectiveFilter === "system"
						? pkg.isSystem
						: !pkg.isSystem,
			)
			.filter(
				(pkg) =>
					!query ||
					pkg.packageName.toLowerCase().includes(query) ||
					displayName(pkg).toLowerCase().includes(query),
			)
			.sort((a, b) =>
				displayName(a).localeCompare(displayName(b), undefined, {
					sensitivity: "base",
				}),
			);
	}, [packages, effectiveFilter, search]);

	const updateCount = Object.keys(updates).length;

	const updateAll = async () => {
		if (!adb || updatingAll) return;
		setUpdatingAll(true);
		try {
			for (const [packageName, update] of Object.entries(updates)) {
				const name = getCatalogApp(packageName)?.name ?? packageName;
				try {
					await installApp(adb, {
						kind: "url",
						urls: update.urls,
						sha256: update.sha256,
					});
					clearUpdate(packageName);
					toast.success(name, { description: t("updated") });
				} catch (err) {
					toast.error(name, {
						description:
							err instanceof Error ? err.message : t("installFailed"),
					});
				}
			}
			await refreshInstalled();
		} finally {
			setUpdatingAll(false);
		}
	};

	return (
		<div className="space-y-4">
			{updateCount > 0 && (
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
					<p className="flex items-center gap-2 text-sm font-medium text-amber-500">
						<ArrowUpCircle className="h-4 w-4" />
						{t("updatesAvailable", { count: updateCount })}
					</p>
					<Button
						onClick={updateAll}
						loading={updatingAll}
						className="bg-amber-500 text-amber-950 hover:bg-amber-400"
					>
						{t("updateAll")}
					</Button>
				</div>
			)}

			<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
				{advanced && (
					<Segmented
						value={filter}
						onChange={setFilter}
						size="sm"
						options={[
							{ value: "user", label: t("filterUser") },
							{ value: "system", label: t("filterSystem") },
							{ value: "all", label: t("filterAll") },
						]}
					/>
				)}
				<div className="relative sm:w-72">
					<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder={t("searchApps")}
						aria-label={t("searchApps")}
						className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
			</div>

			{loading && packages.length === 0 ? (
				<ListSkeleton />
			) : filtered.length === 0 ? (
				<EmptyState title={t("noInstalledApps")} />
			) : (
				<div className="overflow-hidden rounded-xl border border-border bg-card">
					<div className="divide-y divide-border">
						{filtered.map((pkg) => (
							<InstalledRow
								key={pkg.packageName}
								pkg={pkg}
								onDetail={() => navigate(`/apps/${pkg.packageName}`)}
							/>
						))}
					</div>
				</div>
			)}

			<p className="text-right text-xs text-muted-foreground">
				{t("appCount", { count: filtered.length })}
			</p>
		</div>
	);
}

function InstalledRow({
	pkg,
	onDetail,
}: {
	pkg: InstalledPackage;
	onDetail: () => void;
}) {
	const { t } = useTranslation("apps");
	const catApp = getCatalogApp(pkg.packageName);
	const name = catApp?.name ?? pkg.packageName;
	const actions = useAppActions(pkg.packageName, name);
	const version = useAppStore((s) => s.versions[pkg.packageName]);
	const isDefaultLauncher = useAppStore(
		(s) => s.defaultLauncher === pkg.packageName,
	);

	const [confirmUninstall, setConfirmUninstall] = useState(false);
	const [setupOpen, setSetupOpen] = useState(false);

	const program = catApp?.program;
	const revertOnUninstall =
		isPanelProgram(program) && program.revertOnUninstall === true;
	const showSetupGear =
		!!program &&
		!actions.hasUpdate &&
		(isPanelProgram(program) ||
			!(catApp?.category === "launcher" && isDefaultLauncher));

	const handleSetup = () => {
		if (!program) return;
		if (isPanelProgram(program)) setSetupOpen(true);
		else actions.runSetup();
	};

	return (
		<div className="flex items-center gap-3 px-4 py-3">
			<button
				type="button"
				onClick={onDetail}
				title={t("viewDetails")}
				className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<AppIcon
					name={name}
					iconUrl={catApp ? getAppIconUrl(catApp) : undefined}
					className="h-9 w-9 shrink-0 rounded-lg text-xs"
				/>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						{catApp ? (
							<span className="truncate text-sm font-medium group-hover:underline">
								{catApp.name}
							</span>
						) : (
							<span className="truncate font-mono text-xs group-hover:underline">
								{pkg.packageName}
							</span>
						)}
						{catApp?.madeForPortal && (
							<AppBadge tone="violet" title={t("madeForPortal")}>
								<Sparkles className="h-3 w-3" />
								{t("madeForPortal")}
							</AppBadge>
						)}
						{catApp?.category === "launcher" && isDefaultLauncher && (
							<AppBadge tone="emerald">
								<Check className="h-3 w-3" />
								{t("defaultLauncher")}
							</AppBadge>
						)}
						{actions.update && (
							<AppBadge tone="amber" title={t("updateAvailable")}>
								<ArrowUpCircle className="h-3 w-3" />
								{actions.update.installedVersion} →{" "}
								{actions.update.latestVersion}
							</AppBadge>
						)}
					</div>
					<p className="truncate font-mono text-[11px] text-muted-foreground">
						{catApp
							? pkg.packageName
							: t(pkg.isSystem ? "systemApp" : "userApp")}
						{version ? ` · v${version}` : ""}
					</p>
				</div>
			</button>

			<div className="flex shrink-0 items-center gap-1">
				{actions.busy !== null && (
					<span className="mr-1 flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						{actions.progress !== null && `${actions.progress}%`}
					</span>
				)}
				{actions.update && (
					<button
						type="button"
						onClick={actions.install}
						disabled={actions.busy !== null}
						className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-500 transition-colors hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
					>
						{t("update")}
					</button>
				)}
				{showSetupGear && program && (
					<IconAction
						title={t(program.labelKey ?? "runSetup")}
						onClick={handleSetup}
					>
						<Settings className="h-4 w-4" />
					</IconAction>
				)}
				<IconAction title={t("openApp")} onClick={actions.open}>
					<SquareArrowOutUpRight className="h-4 w-4" />
				</IconAction>
				{!pkg.isSystem && (
					<IconAction
						title={t("uninstall")}
						danger
						onClick={() => setConfirmUninstall(true)}
					>
						<Trash2 className="h-4 w-4" />
					</IconAction>
				)}
			</div>

			<ConfirmDialog
				open={confirmUninstall}
				onClose={() => setConfirmUninstall(false)}
				onConfirm={actions.uninstall}
				title={t("uninstall")}
				message={
					revertOnUninstall
						? t("uninstallRevertConfirm", { name })
						: t("uninstallConfirm", { name })
				}
				confirmLabel={t("uninstall")}
				danger
			/>

			{catApp && (
				<AppSetupPanel
					app={catApp}
					open={setupOpen}
					onClose={() => setSetupOpen(false)}
				/>
			)}
		</div>
	);
}

function ListSkeleton() {
	return (
		<div className="overflow-hidden rounded-xl border border-border bg-card">
			<div className="divide-y divide-border">
				{["a", "b", "c", "d", "e", "f"].map((key) => (
					<div
						key={key}
						className="flex animate-pulse items-center gap-3 px-4 py-3"
					>
						<div className="h-9 w-9 shrink-0 rounded-lg bg-secondary" />
						<div className="min-w-0 flex-1 space-y-2">
							<div className="h-3 w-40 rounded bg-secondary" />
							<div className="h-2.5 w-56 rounded bg-secondary/70" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function IconAction({
	title,
	onClick,
	danger,
	children,
}: {
	title: string;
	onClick: () => void;
	danger?: boolean;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			title={title}
			aria-label={title}
			onClick={onClick}
			className={`rounded-md p-1.5 text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
				danger
					? "hover:bg-red-500/10 hover:text-red-500"
					: "hover:bg-accent hover:text-foreground"
			}`}
		>
			{children}
		</button>
	);
}
