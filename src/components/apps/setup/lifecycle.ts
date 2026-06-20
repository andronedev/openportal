import { launchApp } from "@/lib/adb/app-manager";
import { restore } from "@/lib/adb/provision";
import { loadProvisionConfig } from "@/lib/portal/provision-config";
import type { Adb } from "@yume-chan/adb";

/**
 * Lifecycle hooks for custom-setup apps, keyed by `setup.id` (parallels
 * SETUP_PANELS). Imported lazily from use-app-actions so the heavy provisioning
 * engine stays out of the main bundle.
 *
 * - `beforeUninstall` runs before the package is removed (e.g. revert provisioning).
 * - `onUninstallBlocked` runs when the uninstall is refused by an active device
 *   admin; it opens whatever screen lets the user deactivate it and returns the
 *   i18n key for the guidance toast.
 */
export interface SetupLifecycle {
	beforeUninstall?: (adb: Adb) => Promise<void>;
	onUninstallBlocked?: (adb: Adb) => Promise<string | undefined>;
}

export const SETUP_LIFECYCLE: Record<string, SetupLifecycle> = {
	"immortal-provision": {
		beforeUninstall: async (adb) => {
			const { cfg } = await loadProvisionConfig(adb);
			await restore(adb, cfg, () => {});
		},
		onUninstallBlocked: async (adb) => {
			// The shell can't force-remove a non-test admin, but Immortal can remove
			// its own. Its settings activity isn't exported, so open the app (launcher
			// entry) and let the user reach Settings > Device health > Disable
			// screen-off admin, then retry the uninstall.
			await launchApp(adb, "com.immortal.launcher");
			return "uninstallDeviceAdminImmortal";
		},
	},
};
