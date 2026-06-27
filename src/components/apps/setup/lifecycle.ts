import { launchApp } from "@/lib/adb/app-manager";
import { restore } from "@/lib/portal/provision";
import { loadProvisionConfig } from "@/lib/portal/provision-config";
import type { Adb } from "@yume-chan/adb";

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
			await launchApp(adb, "com.immortal.launcher");
			return "uninstallDeviceAdminImmortal";
		},
	},
};
