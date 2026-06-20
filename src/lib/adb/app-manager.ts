import type { Adb } from "@yume-chan/adb";
import { ReadableStream as AdbReadableStream } from "@yume-chan/stream-extra";
import { execShell } from "./shell";
import type { InstalledPackage } from "./types";

export async function listPackages(adb: Adb): Promise<InstalledPackage[]> {
	const [userResult, systemResult] = await Promise.all([
		execShell(adb, "pm list packages -f -3"),
		execShell(adb, "pm list packages -f -s"),
	]);

	const parsePackages = (
		output: string,
		isSystem: boolean,
	): InstalledPackage[] => {
		return output
			.split("\n")
			.filter((line) => line.startsWith("package:"))
			.map((line) => {
				const content = line.slice("package:".length);
				const eqIndex = content.lastIndexOf("=");
				return {
					path: content.slice(0, eqIndex),
					packageName: content.slice(eqIndex + 1),
					isSystem,
				};
			});
	};

	return [
		...parsePackages(userResult.stdout, false),
		...parsePackages(systemResult.stdout, true),
	];
}

export async function installApk(
	adb: Adb,
	file: File,
	onProgress?: (stage: string, percent: number) => void,
): Promise<void> {
	const remotePath = `/data/local/tmp/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

	onProgress?.("pushing", 0);

	const chunkSize = 64 * 1024;
	const total = file.size;
	let sent = 0;
	let pending: Uint8Array | null = null;
	const reader = file.stream().getReader();

	const fileStream = new AdbReadableStream<Uint8Array>({
		async pull(controller) {
			if (!pending) {
				const { done, value } = await reader.read();
				if (done) {
					controller.close();
					return;
				}
				pending = value;
			}
			const slice = pending.subarray(0, chunkSize);
			pending =
				pending.byteLength > chunkSize ? pending.subarray(chunkSize) : null;
			sent += slice.byteLength;
			if (total > 0) {
				onProgress?.("pushing", Math.min(99, Math.round((sent / total) * 100)));
			}
			controller.enqueue(slice);
		},
		cancel(reason) {
			return reader.cancel(reason);
		},
	});

	const sync = await adb.sync();
	try {
		await sync.write({
			filename: remotePath,
			file: fileStream,
			permission: 0o644,
			mtime: Math.floor(Date.now() / 1000),
		});
	} finally {
		await sync.dispose();
	}

	onProgress?.("pushing", 100);
	onProgress?.("installing", 100);

	const result = await execShell(adb, `pm install -r "${remotePath}"`);
	await execShell(adb, `rm "${remotePath}"`);

	if (result.stdout.includes("Failure")) {
		throw new Error(`Install failed: ${result.stdout}`);
	}

	onProgress?.("done", 100);
}

export async function uninstallPackage(
	adb: Adb,
	packageName: string,
): Promise<void> {
	const result = await execShell(adb, `pm uninstall ${packageName}`);
	if (!result.stdout.includes("Success")) {
		throw new Error(`Uninstall failed: ${result.stdout}`);
	}
}

/**
 * Finds a package's active device-admin component (e.g. for an app that can't be
 * uninstalled until its admin is deactivated). Returns null when none is active.
 */
export async function getActiveAdminComponent(
	adb: Adb,
	packageName: string,
): Promise<string | null> {
	const { stdout } = await execShell(adb, "dumpsys device_policy");
	const escaped = packageName.replace(/[.$+]/g, "\\$&");
	const match = new RegExp(`${escaped}/[A-Za-z0-9_.$]+`).exec(stdout);
	return match ? match[0] : null;
}

/**
 * Opens the system screen where the user can deactivate a device admin. Android
 * blocks uninstalling an active admin and won't let the shell force-remove a
 * non-test admin, so the user has to tap Deactivate on the device.
 */
export async function openDeviceAdminDeactivation(
	adb: Adb,
	component: string,
): Promise<void> {
	await execShell(
		adb,
		`am start -a android.app.action.ADD_DEVICE_ADMIN -e android.app.extra.DEVICE_ADMIN ${component}`,
	);
}

export interface InstalledVersion {
	versionName: string;
	versionCode: number;
}

export async function getInstalledVersion(
	adb: Adb,
	packageName: string,
): Promise<InstalledVersion | null> {
	const { stdout } = await execShell(
		adb,
		`dumpsys package ${packageName} | grep -E "versionName=|versionCode=" | head -n 4`,
	);
	const nameMatch = /versionName=(\S+)/.exec(stdout);
	const codeMatch = /versionCode=(\d+)/.exec(stdout);
	if (!nameMatch && !codeMatch) return null;
	return {
		versionName: nameMatch?.[1] ?? "",
		versionCode: codeMatch?.[1] ? Number(codeMatch[1]) : 0,
	};
}

export async function runPostInstall(
	adb: Adb,
	commands: string[],
): Promise<void> {
	for (const cmd of commands) {
		const result = await execShell(adb, cmd);
		if (result.exitCode !== 0) {
			throw new Error(`Command failed (${result.exitCode}): ${cmd}`);
		}
	}
}

export async function clearAppData(
	adb: Adb,
	packageName: string,
): Promise<void> {
	const result = await execShell(adb, `pm clear ${packageName}`);
	if (!result.stdout.includes("Success")) {
		throw new Error(result.stdout || `Failed to clear ${packageName}`);
	}
}

export async function forceStopApp(
	adb: Adb,
	packageName: string,
): Promise<void> {
	const result = await execShell(adb, `am force-stop ${packageName}`);
	if (result.exitCode !== 0) {
		throw new Error(result.stdout || `Failed to stop ${packageName}`);
	}
}

/** Launches an app on the device via its main LAUNCHER activity. */
export async function launchApp(adb: Adb, packageName: string): Promise<void> {
	const { stdout } = await execShell(
		adb,
		`monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`,
	);
	// `monkey` aborts (and says so) when the package has no launchable activity.
	if (/No activities found|monkey aborted|Error:/i.test(stdout)) {
		throw new Error(stdout || `Cannot open ${packageName}`);
	}
}

export interface AppPermission {
	name: string;
	granted: boolean;
}

export async function getAppPermissions(
	adb: Adb,
	packageName: string,
): Promise<AppPermission[]> {
	const { stdout } = await execShell(adb, `dumpsys package ${packageName}`);
	const permissions = new Map<string, boolean>();

	let section: "requested" | "granted" | null = null;
	for (const rawLine of stdout.split("\n")) {
		const line = rawLine.trim();
		if (line === "requested permissions:") {
			section = "requested";
			continue;
		}
		if (
			line === "install permissions:" ||
			line === "runtime permissions:" ||
			line.startsWith("User 0:")
		) {
			section = "granted";
			continue;
		}
		if (!section) continue;
		if (!line.startsWith("android.") && !line.includes(".permission.")) {
			// Left the permission block.
			if (line.length === 0) continue;
			if (!line.includes("permission")) section = null;
			continue;
		}

		const grantedMatch = /^([\w.]+): granted=(true|false)/.exec(line);
		if (grantedMatch?.[1]) {
			permissions.set(grantedMatch[1], grantedMatch[2] === "true");
		} else if (section === "requested") {
			const name = line.split(":")[0]?.trim();
			if (name && !permissions.has(name)) permissions.set(name, false);
		}
	}

	return [...permissions.entries()]
		.map(([name, granted]) => ({ name, granted }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** Returns the package name of the current default launcher (home app). */
export async function getDefaultLauncher(adb: Adb): Promise<string> {
	const { stdout } = await execShell(
		adb,
		"cmd package resolve-activity --brief -c android.intent.category.HOME -a android.intent.action.MAIN",
	);
	const component = stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.reverse()
		.find((line) => line.includes("/"));
	return component ? (component.split("/")[0] ?? "") : "";
}

export async function disableOverlay(
	adb: Adb,
	overlayPackage: string,
): Promise<void> {
	await execShell(adb, `cmd overlay disable --user 0 ${overlayPackage}`);
}
