import type { Adb } from "@yume-chan/adb";
import { execShell } from "./shell";

export const CONTROL_CENTER_PACKAGE = "com.facebook.alohaapps.controlcenter";

export type ControlCenterState = "enabled" | "disabled" | "unavailable";

export async function getControlCenterState(
	adb: Adb,
): Promise<ControlCenterState> {
	const path = await execShell(adb, `pm path ${CONTROL_CENTER_PACKAGE}`);
	if (!path.stdout.startsWith("package:")) return "unavailable";

	const { stdout } = await execShell(
		adb,
		`appops get ${CONTROL_CENTER_PACKAGE} SYSTEM_ALERT_WINDOW`,
	);
	return /SYSTEM_ALERT_WINDOW: (deny|ignore)/.test(stdout)
		? "disabled"
		: "enabled";
}

export async function setControlCenterEnabled(
	adb: Adb,
	enabled: boolean,
): Promise<void> {
	const mode = enabled ? "default" : "deny";
	const result = await execShell(
		adb,
		`appops set ${CONTROL_CENTER_PACKAGE} SYSTEM_ALERT_WINDOW ${mode}`,
	);
	const state = await getControlCenterState(adb);
	if (state !== (enabled ? "enabled" : "disabled")) {
		throw new Error(result.stdout || `appops set ${mode} failed`);
	}
}
