import {
	getDefaultLauncher,
	getInstalledVersion,
	installApk,
	listPackages,
	uninstallPackage,
} from "@/lib/adb/app-manager";
import { MOCK_INSTALLED_PACKAGES } from "@/lib/adb/mock";
import type { InstallTask, InstalledPackage } from "@/lib/adb/types";
import { type CatalogApp, getCatalogApp } from "@/lib/portal/catalog";
import {
	canAutoInstall,
	isNewerVersion,
	resolveApk,
} from "@/lib/portal/sources";
import { create } from "zustand";
import { useDeviceStore } from "./device-store";

export interface AppUpdate {
	url: string;
	urls: string[];
	latestVersion: string;
	installedVersion: string;
	sha256?: string;
}

interface AppStore {
	installedPackages: InstalledPackage[];
	installTasks: InstallTask[];
	loading: boolean;
	updates: Record<string, AppUpdate>;
	versions: Record<string, string>;
	defaultLauncher: string | null;

	refreshInstalled: () => Promise<void>;
	checkUpdates: (force?: boolean) => Promise<void>;
	refreshDefaultLauncher: () => Promise<void>;
	clearUpdate: (packageName: string) => void;
	markInstalled: (packageName: string) => void;
	installFile: (file: File) => Promise<void>;
	uninstall: (packageName: string) => Promise<void>;
	isInstalled: (packageName: string) => boolean;
}

// Update checks hit the GitHub API (60 unauthenticated requests/hour), so
// results are cached and only refetched after this delay or on forced refresh.
const UPDATE_CHECK_TTL = 15 * 60 * 1000;

let checkingUpdates: Promise<void> | null = null;
let updatesCheckedAt = 0;

export const useAppStore = create<AppStore>((set, get) => ({
	installedPackages: [],
	installTasks: [],
	loading: false,
	updates: {},
	versions: {},
	defaultLauncher: null,

	refreshInstalled: async () => {
		const adb = useDeviceStore.getState().adb;
		if (!adb) {
			if (useDeviceStore.getState().state === "connected") {
				set({ installedPackages: MOCK_INSTALLED_PACKAGES });
			}
			return;
		}

		set({ loading: true });
		try {
			set({ installedPackages: await listPackages(adb) });
		} finally {
			set({ loading: false });
		}
	},

	checkUpdates: async (force = false) => {
		const adb = useDeviceStore.getState().adb;
		if (!adb) return;
		if (checkingUpdates) return checkingUpdates;
		if (!force && Date.now() - updatesCheckedAt < UPDATE_CHECK_TTL) return;

		const candidates = get()
			.installedPackages.map((pkg) => getCatalogApp(pkg.packageName))
			.filter(
				(app): app is CatalogApp =>
					!!app && canAutoInstall(app) && !app.skipUpdateCheck,
			);

		checkingUpdates = (async () => {
			try {
				const found: Record<string, AppUpdate> = {};
				const foundVersions: Record<string, string> = {};
				await Promise.all(
					candidates.map(async (app) => {
						try {
							const [latest, installed] = await Promise.all([
								resolveApk(adb, app),
								getInstalledVersion(adb, app.packageName),
							]);
							if (installed?.versionName) {
								foundVersions[app.packageName] = installed.versionName;
							}
							const hasUpdate =
								!!installed &&
								(latest.versionCode != null && installed.versionCode > 0
									? latest.versionCode > installed.versionCode
									: isNewerVersion(latest.version, installed.versionName));
							if (installed && hasUpdate) {
								found[app.packageName] = {
									url: latest.url,
									urls: latest.urls,
									latestVersion: latest.version,
									installedVersion: installed.versionName,
									sha256: latest.sha256,
								};
							}
						} catch {}
					}),
				);
				updatesCheckedAt = Date.now();
				set({
					updates: found,
					versions: { ...get().versions, ...foundVersions },
				});
			} finally {
				checkingUpdates = null;
			}
		})();
		return checkingUpdates;
	},

	refreshDefaultLauncher: async () => {
		const adb = useDeviceStore.getState().adb;
		if (!adb) return;
		try {
			set({ defaultLauncher: await getDefaultLauncher(adb) });
		} catch {}
	},

	clearUpdate: (packageName: string) => {
		set((state) => {
			if (!state.updates[packageName]) return state;
			const { [packageName]: _removed, ...rest } = state.updates;
			return { updates: rest };
		});
	},

	markInstalled: (packageName: string) => {
		set((state) =>
			state.installedPackages.some((p) => p.packageName === packageName)
				? state
				: {
						installedPackages: [
							...state.installedPackages,
							{ packageName, path: "", isSystem: false },
						],
					},
		);
	},

	installFile: async (file: File) => {
		const adb = useDeviceStore.getState().adb;
		if (!adb) throw new Error("Not connected");

		const taskId = crypto.randomUUID();
		const task: InstallTask = {
			id: taskId,
			fileName: file.name,
			status: "queued",
			progress: 0,
		};

		set((state) => ({
			installTasks: [...state.installTasks, task],
		}));

		try {
			await installApk(adb, file, (stage, percent) => {
				set((state) => ({
					installTasks: state.installTasks.map((t) =>
						t.id === taskId
							? {
									...t,
									status: stage as InstallTask["status"],
									progress: percent,
								}
							: t,
					),
				}));
			});

			set((state) => ({
				installTasks: state.installTasks.map((t) =>
					t.id === taskId ? { ...t, status: "done", progress: 100 } : t,
				),
			}));

			await get().refreshInstalled();
		} catch (err) {
			set((state) => ({
				installTasks: state.installTasks.map((t) =>
					t.id === taskId
						? {
								...t,
								status: "error",
								error: err instanceof Error ? err.message : "Install failed",
							}
						: t,
				),
			}));
			throw err;
		}
	},

	uninstall: async (packageName: string) => {
		const adb = useDeviceStore.getState().adb;
		if (!adb) throw new Error("Not connected");
		await uninstallPackage(adb, packageName);
		get().clearUpdate(packageName);
		set((state) => {
			const { [packageName]: _removed, ...versions } = state.versions;
			return {
				versions,
				installedPackages: state.installedPackages.filter(
					(p) => p.packageName !== packageName,
				),
			};
		});
		await get().refreshInstalled();
	},

	isInstalled: (packageName: string) => {
		return get().installedPackages.some((p) => p.packageName === packageName);
	},
}));
