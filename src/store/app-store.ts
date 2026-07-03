import {
	getDefaultLauncher,
	getInstalledVersion,
	listPackages,
	uninstallPackage,
} from "@/lib/adb/app-manager";
import { installApp } from "@/lib/adb/install";
import { MOCK_INSTALLED_PACKAGES } from "@/lib/adb/mock";
import type { InstallTask, InstalledPackage } from "@/lib/adb/types";
import { type CatalogApp, getCatalogApp } from "@/lib/catalog";
import {
	hasResolvableSource,
	isNewerVersion,
	resolveApk,
} from "@/lib/catalog/sources";
import type { Adb } from "@yume-chan/adb";
import { create } from "zustand";
import { getActiveSerial, useActiveSerial, useFleetStore } from "./fleet-store";

export interface AppUpdate {
	url: string;
	urls: string[];
	latestVersion: string;
	installedVersion: string;
	sha256?: string;
}

interface DeviceApps {
	installedPackages: InstalledPackage[];
	installTasks: InstallTask[];
	loading: boolean;
	updates: Record<string, AppUpdate>;
	versions: Record<string, string>;
	defaultLauncher: string | null;
}

interface AppStore {
	byDevice: Record<string, DeviceApps>;

	refreshInstalled: (serial?: string) => Promise<void>;
	checkUpdates: (force?: boolean, serial?: string) => Promise<void>;
	refreshDefaultLauncher: (serial?: string) => Promise<void>;
	clearUpdate: (packageName: string, serial?: string) => void;
	markInstalled: (packageName: string, serial?: string) => void;
	installFile: (file: File, serial?: string) => Promise<void>;
	uninstall: (packageName: string, serial?: string) => Promise<void>;
	isInstalled: (packageName: string, serial?: string) => boolean;
	dropDevice: (serial: string) => void;
}

// Update checks hit the GitHub API (60 unauthenticated requests/hour), so
// results are cached and only refetched after this delay or on forced refresh.
const UPDATE_CHECK_TTL = 15 * 60 * 1000;

const EMPTY_DEVICE_APPS: DeviceApps = {
	installedPackages: [],
	installTasks: [],
	loading: false,
	updates: {},
	versions: {},
	defaultLauncher: null,
};

const EMPTY_PACKAGES: InstalledPackage[] = [];
const EMPTY_UPDATES: Record<string, AppUpdate> = {};
const EMPTY_TASKS: InstallTask[] = [];

const updateGuards = new Map<
	string,
	{ inflight: Promise<void> | null; checkedAt: number }
>();

interface Target {
	serial: string;
	adb: Adb | null;
	connected: boolean;
}

function resolveTarget(serial?: string): Target | null {
	const target = serial ?? getActiveSerial();
	if (!target) return null;
	const conn = useFleetStore.getState().connections[target];
	return {
		serial: target,
		adb: conn?.adb ?? null,
		connected: conn?.state === "connected",
	};
}

export const useAppStore = create<AppStore>((set, get) => {
	const device = (serial: string): DeviceApps =>
		get().byDevice[serial] ?? EMPTY_DEVICE_APPS;

	const patch = (serial: string, p: Partial<DeviceApps>) =>
		set((s) => ({
			byDevice: {
				...s.byDevice,
				[serial]: { ...(s.byDevice[serial] ?? EMPTY_DEVICE_APPS), ...p },
			},
		}));

	return {
		byDevice: {},

		refreshInstalled: async (serial) => {
			const target = resolveTarget(serial);
			if (!target) return;
			if (!target.adb) {
				if (target.connected) {
					patch(target.serial, { installedPackages: MOCK_INSTALLED_PACKAGES });
				}
				return;
			}
			patch(target.serial, { loading: true });
			try {
				patch(target.serial, {
					installedPackages: await listPackages(target.adb),
				});
			} finally {
				patch(target.serial, { loading: false });
			}
		},

		// biome-ignore lint/style/useDefaultParameterLast: force precedes serial to match every call-site's "force check, default device" phrasing.
		checkUpdates: async (force = false, serial) => {
			const target = resolveTarget(serial);
			if (!target || !target.adb) return;
			const adb = target.adb;
			const key = target.serial;

			const guard = updateGuards.get(key);
			if (guard?.inflight) return guard.inflight;
			if (!force && guard && Date.now() - guard.checkedAt < UPDATE_CHECK_TTL) {
				return;
			}

			const candidates = device(key)
				.installedPackages.map((pkg) => getCatalogApp(pkg.packageName))
				.filter(
					(app): app is CatalogApp =>
						!!app && hasResolvableSource(app) && !app.skipUpdateCheck,
				);

			const run = (async () => {
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
					patch(key, {
						updates: found,
						versions: { ...device(key).versions, ...foundVersions },
					});
				} finally {
					updateGuards.set(key, { inflight: null, checkedAt: Date.now() });
				}
			})();

			updateGuards.set(key, {
				inflight: run,
				checkedAt: guard?.checkedAt ?? 0,
			});
			return run;
		},

		refreshDefaultLauncher: async (serial) => {
			const target = resolveTarget(serial);
			if (!target || !target.adb) return;
			try {
				patch(target.serial, {
					defaultLauncher: await getDefaultLauncher(target.adb),
				});
			} catch {}
		},

		clearUpdate: (packageName, serial) => {
			const key = serial ?? getActiveSerial();
			if (!key) return;
			set((s) => {
				const d = s.byDevice[key] ?? EMPTY_DEVICE_APPS;
				if (!d.updates[packageName]) return s;
				const { [packageName]: _removed, ...updates } = d.updates;
				return { byDevice: { ...s.byDevice, [key]: { ...d, updates } } };
			});
		},

		markInstalled: (packageName, serial) => {
			const key = serial ?? getActiveSerial();
			if (!key) return;
			set((s) => {
				const d = s.byDevice[key] ?? EMPTY_DEVICE_APPS;
				if (d.installedPackages.some((p) => p.packageName === packageName)) {
					return s;
				}
				return {
					byDevice: {
						...s.byDevice,
						[key]: {
							...d,
							installedPackages: [
								...d.installedPackages,
								{ packageName, path: "", isSystem: false },
							],
						},
					},
				};
			});
		},

		installFile: async (file, serial) => {
			const target = resolveTarget(serial);
			if (!target || !target.adb) throw new Error("Not connected");
			const adb = target.adb;
			const key = target.serial;

			const taskId = crypto.randomUUID();
			const task: InstallTask = {
				id: taskId,
				fileName: file.name,
				status: "queued",
				progress: 0,
			};
			patch(key, { installTasks: [...device(key).installTasks, task] });

			const updateTask = (change: Partial<InstallTask>) =>
				patch(key, {
					installTasks: device(key).installTasks.map((t) =>
						t.id === taskId ? { ...t, ...change } : t,
					),
				});

			try {
				await installApp(
					adb,
					{ kind: "file", file },
					{
						onProgress: (stage, percent) =>
							updateTask({
								status: stage as InstallTask["status"],
								progress: percent ?? task.progress,
							}),
					},
				);
				updateTask({ status: "done", progress: 100 });
				await get().refreshInstalled(key);
			} catch (err) {
				updateTask({
					status: "error",
					error: err instanceof Error ? err.message : "Install failed",
				});
				throw err;
			}
		},

		uninstall: async (packageName, serial) => {
			const target = resolveTarget(serial);
			if (!target || !target.adb) throw new Error("Not connected");
			const key = target.serial;
			await uninstallPackage(target.adb, packageName);
			get().clearUpdate(packageName, key);
			set((s) => {
				const d = s.byDevice[key] ?? EMPTY_DEVICE_APPS;
				const { [packageName]: _removed, ...versions } = d.versions;
				return {
					byDevice: {
						...s.byDevice,
						[key]: {
							...d,
							versions,
							installedPackages: d.installedPackages.filter(
								(p) => p.packageName !== packageName,
							),
						},
					},
				};
			});
			await get().refreshInstalled(key);
		},

		isInstalled: (packageName, serial) => {
			const key = serial ?? getActiveSerial();
			if (!key) return false;
			return (get().byDevice[key] ?? EMPTY_DEVICE_APPS).installedPackages.some(
				(p) => p.packageName === packageName,
			);
		},

		dropDevice: (serial) => {
			updateGuards.delete(serial);
			set((s) => {
				if (!s.byDevice[serial]) return s;
				const { [serial]: _removed, ...byDevice } = s.byDevice;
				return { byDevice };
			});
		},
	};
});

export function useInstalledPackages(): InstalledPackage[] {
	const serial = useActiveSerial();
	return useAppStore((s) =>
		serial
			? (s.byDevice[serial]?.installedPackages ?? EMPTY_PACKAGES)
			: EMPTY_PACKAGES,
	);
}

export function useAppUpdates(): Record<string, AppUpdate> {
	const serial = useActiveSerial();
	return useAppStore((s) =>
		serial ? (s.byDevice[serial]?.updates ?? EMPTY_UPDATES) : EMPTY_UPDATES,
	);
}

export function useAppsLoading(): boolean {
	const serial = useActiveSerial();
	return useAppStore((s) =>
		serial ? (s.byDevice[serial]?.loading ?? false) : false,
	);
}

export function useDefaultLauncher(): string | null {
	const serial = useActiveSerial();
	return useAppStore((s) =>
		serial ? (s.byDevice[serial]?.defaultLauncher ?? null) : null,
	);
}

export function useInstallTasks(): InstallTask[] {
	const serial = useActiveSerial();
	return useAppStore((s) =>
		serial ? (s.byDevice[serial]?.installTasks ?? EMPTY_TASKS) : EMPTY_TASKS,
	);
}

export function useIsInstalled(packageName: string): boolean {
	const serial = useActiveSerial();
	return useAppStore((s) =>
		serial
			? (s.byDevice[serial]?.installedPackages ?? EMPTY_PACKAGES).some(
					(p) => p.packageName === packageName,
				)
			: false,
	);
}

export function useAppUpdate(packageName: string): AppUpdate | undefined {
	const serial = useActiveSerial();
	return useAppStore((s) =>
		serial ? s.byDevice[serial]?.updates[packageName] : undefined,
	);
}

export function useAppVersion(packageName: string): string | undefined {
	const serial = useActiveSerial();
	return useAppStore((s) =>
		serial ? s.byDevice[serial]?.versions[packageName] : undefined,
	);
}

export function useIsDefaultLauncher(packageName: string): boolean {
	const serial = useActiveSerial();
	return useAppStore((s) =>
		serial ? s.byDevice[serial]?.defaultLauncher === packageName : false,
	);
}
