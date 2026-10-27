import {
	ApkDropOverlay,
	ApkInstallModal,
} from "@/components/apps/ApkInstaller";
import { AppCatalog } from "@/components/apps/AppCatalog";
import { InstalledAppsList } from "@/components/apps/InstalledAppsList";
import { Button, Segmented } from "@/components/ui/primitives";
import {
	useAppStore,
	useAppUpdates,
	useAppsLoading,
	useInstalledPackages,
} from "@/store/app-store";
import { useActiveState } from "@/store/fleet-store";
import { FileUp, RefreshCw, Usb } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

type Tab = "catalog" | "installed";

export function AppsPage() {
	const { t } = useTranslation("apps");
	const isVisitor = useActiveState() !== "connected";
	const refreshInstalled = useAppStore((s) => s.refreshInstalled);
	const checkUpdates = useAppStore((s) => s.checkUpdates);
	const refreshDefaultLauncher = useAppStore((s) => s.refreshDefaultLauncher);
	const installedPackages = useInstalledPackages();
	const updates = useAppUpdates();
	const loading = useAppsLoading();
	const [tab, setTab] = useState<Tab>("catalog");
	const [apkOpen, setApkOpen] = useState(false);

	const handleRefresh = () => {
		refreshInstalled().then(() => {
			checkUpdates(true);
			refreshDefaultLauncher();
		});
	};

	const userCount = installedPackages.filter((p) => !p.isSystem).length;
	const updateCount = Object.keys(updates).length;
	const isCatalog = tab === "catalog";

	const content = (
		<>
			<div className="flex items-start gap-3">
				<div className="min-w-0 flex-1">
					<h1 className="text-2xl font-bold">
						{t(isCatalog ? "catalog" : "manageInstalled")}
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{t(
							isVisitor
								? "visitorCatalogDescription"
								: isCatalog
									? "catalogDescription"
									: "manageInstalledDesc",
						)}
					</p>
				</div>
				<div className="flex shrink-0 flex-wrap items-center gap-2">
					{!isVisitor && (
						<>
							<Segmented
								value={tab}
								onChange={setTab}
								options={[
									{ value: "catalog", label: t("tabCatalog") },
									{
										value: "installed",
										label: t("tabInstalled"),
										badge: userCount || undefined,
										dot: updateCount > 0,
									},
								]}
							/>
							<button
								type="button"
								onClick={handleRefresh}
								title={t("refresh")}
								aria-label={t("refresh")}
								className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<RefreshCw
									className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
								/>
							</button>
							<Button variant="primary" onClick={() => setApkOpen(true)}>
								<FileUp className="h-4 w-4" />
								{t("installApk")}
							</Button>
						</>
					)}
				</div>
			</div>

			{isVisitor && (
				<div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
					<Usb className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
					<p className="text-muted-foreground">{t("visitorConnectHint")}</p>
				</div>
			)}

			<div className={isCatalog ? undefined : "hidden"}>
				<AppCatalog />
			</div>
			{!isVisitor && (
				<div className={isCatalog ? "hidden" : undefined}>
					<InstalledAppsList />
				</div>
			)}

			{!isVisitor && (
				<>
					<ApkInstallModal open={apkOpen} onClose={() => setApkOpen(false)} />
					<ApkDropOverlay />
				</>
			)}
		</>
	);

	return <div className="mx-auto max-w-4xl space-y-5">{content}</div>;
}
