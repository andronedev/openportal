import {
	clearAppData,
	forceStopApp,
	getActiveAdminComponent,
	launchApp,
	openDeviceAdminDeactivation,
	runPostInstall,
} from "@/lib/adb/app-manager";
import { type InstallStage, installApp } from "@/lib/adb/install";
import { type CatalogApp, getCatalogApp, isPanelProgram } from "@/lib/catalog";
import { resolveApk } from "@/lib/catalog/sources";
import { installMorpheApp } from "@/lib/programs/morphe-runner";
import { useAppStore } from "@/store/app-store";
import { useDeviceStore } from "@/store/device-store";
import type { Adb } from "@yume-chan/adb";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export type AppActionKind =
	| "install"
	| "update"
	| "open"
	| "setup"
	| "uninstall"
	| "forceStop"
	| "clearData";

export function useAppActions(packageName: string, displayName: string) {
	const { t } = useTranslation("apps");
	const adb = useDeviceStore((s) => s.adb);
	const connect = useDeviceStore((s) => s.connect);
	const isInstalled = useAppStore((s) => s.isInstalled(packageName));
	const update = useAppStore((s) => s.updates[packageName]);
	const refreshInstalled = useAppStore((s) => s.refreshInstalled);
	const refreshDefaultLauncher = useAppStore((s) => s.refreshDefaultLauncher);
	const clearUpdate = useAppStore((s) => s.clearUpdate);
	const markInstalled = useAppStore((s) => s.markInstalled);
	const uninstallPackage = useAppStore((s) => s.uninstall);
	const installedPackages = useAppStore((s) => s.installedPackages);

	const [busy, setBusy] = useState<AppActionKind | null>(null);
	const [stage, setStage] = useState<InstallStage | null>(null);
	const [progress, setProgress] = useState<number | null>(null);

	const app = getCatalogApp(packageName);
	const hasUpdate = isInstalled && update !== undefined;

	const missingRequires = (app?.requires ?? [])
		.filter((pkg) => !installedPackages.some((p) => p.packageName === pkg))
		.map((pkg) => getCatalogApp(pkg))
		.filter((dep): dep is CatalogApp => !!dep);

	const run = async (kind: AppActionKind, action: () => Promise<void>) => {
		if (busy) return;
		setBusy(kind);
		try {
			await action();
		} catch (err) {
			toast.error(displayName, {
				description: err instanceof Error ? err.message : t("actionFailed"),
			});
		} finally {
			setBusy(null);
		}
	};

	const installCatalogApp = async (
		activeAdb: Adb,
		target: CatalogApp,
		cached?: { urls: string[]; sha256?: string },
	) => {
		if (target.source === "morphe") {
			await installMorpheApp(activeAdb, target.packageName, (ev) => {
				if (ev.status === "running") {
					setStage("installing");
					setProgress(null);
				}
			});
		} else {
			const resolved = cached ?? (await resolveApk(activeAdb, target));
			await installApp(
				activeAdb,
				{ kind: "url", urls: resolved.urls, sha256: resolved.sha256 },
				{
					onProgress: (s, percent) => {
						setStage(s);
						setProgress(percent);
					},
				},
			);
		}
		markInstalled(target.packageName);
		clearUpdate(target.packageName);
	};

	const doInstall = (withDeps: boolean, runSetup: boolean) =>
		run(hasUpdate ? "update" : "install", async () => {
			if (!app) return;
			let activeAdb = adb;
			if (!activeAdb) {
				await connect();
				activeAdb = useDeviceStore.getState().adb;
				if (!activeAdb) return;
				await refreshInstalled();
				if (useAppStore.getState().isInstalled(packageName)) {
					toast.info(displayName, { description: t("alreadyInstalled") });
					return;
				}
			}
			const updating = hasUpdate;
			setStage("downloading");
			setProgress(null);
			try {
				if (withDeps) {
					for (const dep of missingRequires) {
						await installCatalogApp(activeAdb, dep);
					}
				}
				await installCatalogApp(activeAdb, app, update);
			} finally {
				setStage(null);
				setProgress(null);
			}
			toast.success(displayName, {
				description: t(updating ? "updated" : "installed"),
			});
			await refreshInstalled();
			if (
				runSetup &&
				!updating &&
				app.program?.kind === "commands" &&
				app.program.auto
			) {
				try {
					await runPostInstall(activeAdb, app.program.commands);
					await refreshDefaultLauncher();
				} catch {}
			}
		});

	const startInstall = (runSetup: boolean) => {
		if (app && missingRequires.length > 0) {
			toast(displayName, {
				description: t("requiresDescription", {
					deps: missingRequires.map((dep) => dep.name).join(", "),
				}),
				duration: 15000,
				action: {
					label: t("installWithDeps"),
					onClick: () => doInstall(true, runSetup),
				},
			});
			return;
		}
		doInstall(false, runSetup);
	};

	const install = () => startInstall(true);
	const installWithoutSetup = () => startInstall(false);

	const open = () =>
		run("open", async () => {
			if (!adb) return;
			await launchApp(adb, packageName);
			toast.success(t("launched", { name: displayName }));
		});

	const runSetup = () =>
		run("setup", async () => {
			if (!adb || app?.program?.kind !== "commands") return;
			await runPostInstall(adb, app.program.commands);
			toast.success(displayName, { description: t("postInstallDone") });
			await refreshDefaultLauncher();
		});

	const uninstall = () =>
		run("uninstall", async () => {
			if (!adb || !app) return;
			const program = app.program;
			const lifecycle =
				isPanelProgram(program) && program.revertOnUninstall
					? (await import("./setup/lifecycle")).getSetupLifecycle(app)
					: undefined;
			if (lifecycle?.beforeUninstall) {
				toast.info(displayName, { description: t("revertingBeforeUninstall") });
				await lifecycle.beforeUninstall(adb);
			}
			try {
				await uninstallPackage(packageName);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				if (/DEVICE_POLICY_MANAGER/.test(message)) {
					let key = "uninstallDeviceAdmin";
					if (lifecycle?.onUninstallBlocked) {
						const hookKey = await lifecycle
							.onUninstallBlocked(adb)
							.catch(() => undefined);
						if (typeof hookKey === "string") key = hookKey;
					} else {
						const component = await getActiveAdminComponent(
							adb,
							packageName,
						).catch(() => null);
						if (component) {
							await openDeviceAdminDeactivation(adb, component).catch(() => {});
						}
					}
					throw new Error(t(key, { name: displayName }));
				}
				throw err;
			}
			toast.success(t("uninstalled", { name: displayName }));
		});

	const forceStop = () =>
		run("forceStop", async () => {
			if (!adb) return;
			await forceStopApp(adb, packageName);
			toast.success(t("forceStopped", { name: displayName }));
		});

	const clearData = () =>
		run("clearData", async () => {
			if (!adb) return;
			await clearAppData(adb, packageName);
			toast.success(t("dataCleared", { name: displayName }));
		});

	return {
		app,
		isInstalled,
		update,
		hasUpdate,
		busy,
		stage,
		progress,
		install,
		installWithoutSetup,
		open,
		runSetup,
		uninstall,
		forceStop,
		clearData,
	};
}
