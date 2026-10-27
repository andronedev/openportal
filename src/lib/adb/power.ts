import type { Adb } from "@yume-chan/adb";

const REBOOT_SETTLE_MS = 5_000;

export async function rebootDevice(adb: Adb): Promise<void> {
	await Promise.race([
		adb.power.reboot().catch(() => undefined),
		new Promise((resolve) => setTimeout(resolve, REBOOT_SETTLE_MS)),
	]);
}
