import { launchApp } from "@/lib/adb/app-manager";
import type { CatalogApp } from "@/lib/catalog";
import { loadProgram, restore } from "@/lib/programs";
import { loadProgramConfig } from "@/lib/programs/config";
import type { Adb } from "@yume-chan/adb";

export interface SetupLifecycle {
	beforeUninstall?: (adb: Adb) => Promise<void>;
	onUninstallBlocked?: (adb: Adb) => Promise<string | undefined>;
}

/**
 * The uninstall-time hooks for an app's program, when it opts in with
 * `revertOnUninstall`. A `sandboxed` program reverts by running its own
 * `restore` (the inverse of provisioning) and, if the OS blocks the uninstall
 * on an active device admin, opens the app so the user can deactivate it.
 */
export function getSetupLifecycle(app: CatalogApp): SetupLifecycle | undefined {
	const program = app.program;
	if (program?.kind === "sandboxed" && program.revertOnUninstall) {
		return {
			beforeUninstall: async (adb) => {
				const [{ cfg }, loaded] = await Promise.all([
					loadProgramConfig(adb, program.repo),
					loadProgram(adb, program),
				]);
				await restore(adb, cfg, () => {}, { program: loaded });
			},
			onUninstallBlocked: async (adb) => {
				await launchApp(adb, app.packageName);
				return "uninstallDeviceAdmin";
			},
		};
	}
	return undefined;
}
