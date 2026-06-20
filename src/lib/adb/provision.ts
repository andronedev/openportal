import type { ProvisionConfig } from "@/lib/portal/provision-config";
import { resolveFdroidLatest, resolveGithubLatest } from "@/lib/portal/sources";
import type { Adb } from "@yume-chan/adb";
import { getIpAddress } from "./device-info";
import { makeDirectory, pushFile } from "./file-system";
import { clearLogcat, dumpLogcat } from "./logcat";
import { installFromUrl } from "./online-install";
import { execShell, getprop } from "./shell";

const STATE_FILE = "/sdcard/immortal_restore.env";
const MEDIA_LISTENER = "com.immortal.launcher.MediaNotificationListenerService";
const SHIZUKU_PKG = "moe.shizuku.privileged.api";

export type StepStatus = "running" | "ok" | "warn" | "skip" | "error";

export interface StepEvent {
	id: string;
	status: StepStatus;
	detail?: string;
	code?: string;
}

export type OnStep = (event: StepEvent) => void;

export interface ProvisionOptions {
	disableOta: boolean;
	disablePresence: boolean;
	installShizuku: boolean;
	runPreinstalls: boolean;
	setLauncher: boolean;
	enableFleet: boolean;
	fleetName?: string;
	restoreAlexa: boolean;
	photos?: File[];
}

export interface FleetInventory {
	serial: string;
	name: string;
	model: string;
	ip: string;
	agentPort: number;
	token: string;
}

export interface ProvisionResult {
	fleet: FleetInventory | null;
}

export interface ProvisionStatus {
	statusBar: string;
	darkMode: boolean;
	home: string;
	screensaver: string;
	verifier: "disabled" | "enabled";
	installerDialog: "fixed" | "stock";
	osUpdates: "disabled" | "enabled";
	client: "installed" | "not installed";
}

interface Ctx {
	adb: Adb;
	cfg: ProvisionConfig;
	sdk: number;
	onStep: OnStep;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sh(adb: Adb, command: string, timeoutMs = 30_000) {
	try {
		return await execShell(adb, command, { timeoutMs });
	} catch {
		return { stdout: "", exitCode: 1 };
	}
}

export async function readSdk(adb: Adb): Promise<number> {
	const value = (await getprop(adb, "ro.build.version.sdk")).trim();
	const n = Number.parseInt(value, 10);
	return Number.isFinite(n) ? n : 99;
}

export function defaultOptions(
	cfg: ProvisionConfig,
	sdk: number,
): ProvisionOptions {
	return {
		disableOta: cfg.disableOta ?? true,
		disablePresence: cfg.disablePresence,
		installShizuku: cfg.shizukuApkUrl.length > 0,
		runPreinstalls: true,
		setLauncher: cfg.setLauncher,
		enableFleet: cfg.enableFleet,
		fleetName: cfg.fleetName,
		restoreAlexa: (cfg.restoreAlexa ?? false) && sdk < 29,
		photos: undefined,
	};
}

async function installClient(ctx: Ctx): Promise<void> {
	const { adb, cfg, onStep } = ctx;
	onStep({ id: "installClient", status: "running" });
	try {
		const urls = cfg.releaseApkUrl
			? [cfg.releaseApkUrl]
			: (await resolveGithubLatest(cfg.releaseRepo)).urls;
		await installFromUrl(
			adb,
			urls,
			(_stage, percent) =>
				onStep({
					id: "installClient",
					status: "running",
					detail: percent != null ? `${percent}%` : undefined,
				}),
			undefined,
			"-r -d",
		);
		onStep({ id: "installClient", status: "ok", detail: cfg.pkg });
	} catch (err) {
		onStep({
			id: "installClient",
			status: "error",
			detail: err instanceof Error ? err.message : String(err),
		});
		throw err;
	}
}

async function startShizuku(ctx: Ctx): Promise<void> {
	const { adb, cfg, onStep } = ctx;
	if (cfg.shizukuApkUrl.length === 0) {
		onStep({ id: "startShizuku", status: "skip" });
		return;
	}
	onStep({ id: "startShizuku", status: "running" });
	const installed = (
		await sh(adb, `pm list packages ${SHIZUKU_PKG}`)
	).stdout.includes(`package:${SHIZUKU_PKG}`);
	if (!installed) {
		try {
			await installFromUrl(adb, [cfg.shizukuApkUrl]);
		} catch {
			onStep({ id: "startShizuku", status: "warn", code: "shizukuInstall" });
			return;
		}
	}
	const apkpath = (await sh(adb, `pm path ${SHIZUKU_PKG}`)).stdout
		.replace(/^package:/, "")
		.split("\n")[0]
		?.trim();
	if (!apkpath) {
		onStep({ id: "startShizuku", status: "warn", code: "shizukuStarter" });
		return;
	}
	const apkdir = (await sh(adb, `dirname '${apkpath}'`)).stdout.trim();
	const starter = (
		await sh(adb, `ls ${apkdir}/lib/*/libshizuku.so 2>/dev/null`)
	).stdout
		.split("\n")[0]
		?.trim();
	if (!starter) {
		onStep({ id: "startShizuku", status: "warn", code: "shizukuStarter" });
		return;
	}
	await sh(adb, starter);
	for (let i = 0; i < 6; i++) {
		const alive = (await sh(adb, "pgrep -f shizuku_server")).stdout.trim();
		if (alive.length > 0) {
			onStep({ id: "startShizuku", status: "ok" });
			return;
		}
		await sleep(1000);
	}
	onStep({ id: "startShizuku", status: "warn", code: "shizukuStay" });
}

async function installApps(ctx: Ctx): Promise<void> {
	const { adb, cfg, onStep } = ctx;
	if (cfg.preinstallFdroid.length === 0 && cfg.preinstallApks.length === 0) {
		onStep({ id: "installApps", status: "skip" });
		return;
	}
	let n = 0;
	for (const spec of cfg.preinstallFdroid) {
		const [id, vc] = spec.split(":");
		if (!id) continue;
		onStep({ id: "installApps", status: "running", detail: id });
		try {
			const urls = vc
				? [`https://f-droid.org/repo/${id}_${vc}.apk`]
				: (await resolveFdroidLatest(adb, id)).urls;
			await installFromUrl(adb, urls);
			n++;
		} catch {}
	}
	for (const url of cfg.preinstallApks) {
		onStep({ id: "installApps", status: "running", detail: url });
		try {
			await installFromUrl(adb, [url]);
			n++;
		} catch {}
	}
	onStep({ id: "installApps", status: "ok", detail: `${n}` });
}

async function pushAssets(ctx: Ctx, photos?: File[]): Promise<void> {
	const { adb, cfg, onStep } = ctx;
	if (!photos || photos.length === 0) {
		onStep({ id: "pushAssets", status: "skip" });
		return;
	}
	const dir = `/sdcard/Android/data/${cfg.pkg}/files`;
	await makeDirectory(adb, dir).catch(() => {});
	let n = 0;
	for (let i = 0; i < photos.length; i++) {
		const photo = photos[i];
		if (!photo) continue;
		const file =
			i === 0 ? new File([photo], "frame.jpg", { type: photo.type }) : photo;
		try {
			await pushFile(adb, dir, file);
			n++;
		} catch {}
	}
	onStep({ id: "pushAssets", status: "ok", detail: `${n}` });
}

async function grantPerms(ctx: Ctx): Promise<void> {
	const { adb, cfg, onStep } = ctx;
	const p = cfg.pkg;
	onStep({ id: "grantPerms", status: "running" });
	for (const perm of cfg.permissions) {
		await sh(adb, `pm grant ${p} ${perm}`);
	}
	await sh(adb, `pm grant ${p} android.permission.WRITE_SECURE_SETTINGS`);
	await sh(adb, `pm grant ${p} android.permission.READ_EXTERNAL_STORAGE`);
	await sh(adb, `pm grant ${p} android.permission.WRITE_EXTERNAL_STORAGE`);
	await sh(adb, `pm grant ${p} android.permission.READ_LOGS`);
	await sh(adb, `appops set ${p} SYSTEM_ALERT_WINDOW allow`);
	await sh(adb, `appops set ${p} REQUEST_INSTALL_PACKAGES allow`);
	await sh(adb, `appops set ${p} GET_USAGE_STATS allow`);
	const admin = await sh(adb, `dpm set-active-admin ${p}/.AdminReceiver`);
	const adminOk = /success/i.test(admin.stdout);
	await sh(adb, `cmd notification allow_listener ${p}/${MEDIA_LISTENER}`);
	onStep({
		id: "grantPerms",
		status: adminOk ? "ok" : "warn",
		code: adminOk ? undefined : "deviceAdmin",
	});
}

async function applySystemTweaks(ctx: Ctx): Promise<void> {
	const { adb, onStep } = ctx;
	onStep({ id: "applySystemTweaks", status: "running" });
	await sh(adb, 'settings put global policy_control "immersive.status=*"');
	await sh(adb, "settings put global hidden_api_policy_pre_p_apps 1");
	await sh(adb, "settings put global hidden_api_policy_p_apps 1");
	await sh(adb, "settings put global hidden_api_policy 1");
	await sh(adb, "settings put global development_settings_enabled 1");
	onStep({ id: "applySystemTweaks", status: "ok" });
}

async function disableVerifier(ctx: Ctx): Promise<void> {
	const { adb, cfg, onStep } = ctx;
	if (!cfg.disableVerifier) {
		onStep({ id: "disableVerifier", status: "skip" });
		return;
	}
	onStep({ id: "disableVerifier", status: "running" });
	await sh(adb, `pm disable-user --user 0 ${cfg.verifierPkg}`);
	await sh(adb, "settings put global package_verifier_enable 0");
	onStep({ id: "disableVerifier", status: "ok" });
}

async function disableInstallerOverlay(ctx: Ctx): Promise<void> {
	const { adb, cfg, sdk, onStep } = ctx;
	if (!cfg.disableInstallerOverlay || sdk >= 29) {
		onStep({ id: "disableInstallerOverlay", status: "skip" });
		return;
	}
	onStep({ id: "disableInstallerOverlay", status: "running" });
	const present = (await sh(adb, "cmd overlay list 2>/dev/null")).stdout;
	let did = false;
	for (const ov of cfg.installerOverlayPkgs) {
		if (!present.includes(ov)) continue;
		await sh(adb, `cmd overlay disable --user 0 ${ov}`);
		did = true;
	}
	if (did) {
		await sh(adb, "settings put global immortal_overlay_fix 1");
		onStep({ id: "disableInstallerOverlay", status: "ok" });
	} else {
		onStep({
			id: "disableInstallerOverlay",
			status: "warn",
			code: "noOverlay",
		});
	}
}

async function disableOta(ctx: Ctx, enabled: boolean): Promise<void> {
	const { adb, cfg, onStep } = ctx;
	if (!enabled) {
		onStep({ id: "disableOta", status: "skip" });
		return;
	}
	onStep({ id: "disableOta", status: "running" });
	for (const pkg of cfg.otaPackages) {
		await sh(adb, `pm disable-user --user 0 ${pkg}`);
	}
	onStep({ id: "disableOta", status: "ok" });
}

async function disablePresence(ctx: Ctx, enabled: boolean): Promise<void> {
	const { adb, cfg, onStep } = ctx;
	if (!enabled || !cfg.presencePkg) {
		onStep({ id: "disablePresence", status: "skip" });
		return;
	}
	onStep({ id: "disablePresence", status: "running" });
	await sh(adb, `pm disable-user --user 0 ${cfg.presencePkg}`);
	onStep({ id: "disablePresence", status: "ok" });
}

function resolveStockHome(query: string, pkg: string): string {
	for (const line of query.split("\n")) {
		const t = line.trim();
		if (!/^[A-Za-z0-9_.]+\//.test(t)) continue;
		if (t.startsWith(`${pkg}/`)) continue;
		if (t.startsWith("android/")) continue;
		if (t.startsWith("com.android.settings/")) continue;
		return t;
	}
	return "";
}

async function snapshotStock(ctx: Ctx): Promise<void> {
	const { adb, cfg, onStep } = ctx;
	const exists = (await sh(adb, `[ -f ${STATE_FILE} ] && echo yes`)).stdout;
	if (exists.includes("yes")) {
		onStep({ id: "snapshotStock", status: "skip" });
		return;
	}
	onStep({ id: "snapshotStock", status: "running" });
	const query = (
		await sh(
			adb,
			"cmd package query-activities --components -a android.intent.action.MAIN -c android.intent.category.HOME",
		)
	).stdout;
	let home = resolveStockHome(query, cfg.pkg) || cfg.stockHome;
	let dream = (
		await sh(adb, "settings get secure screensaver_components")
	).stdout.trim();
	let ddream = (
		await sh(adb, "settings get secure screensaver_default_component")
	).stdout.trim();
	if (!home) home = cfg.stockHome;
	if (!dream || dream === "null" || dream.startsWith(`${cfg.pkg}/`)) {
		dream = cfg.stockDream;
	}
	if (!ddream || ddream === "null" || ddream.startsWith(`${cfg.pkg}/`)) {
		ddream = cfg.stockDefaultDream;
	}
	const content = `STOCK_HOME=${home}\nSTOCK_DREAM=${dream}\nSTOCK_DEFAULT_DREAM=${ddream}\n`;
	try {
		await pushFile(
			adb,
			"/sdcard",
			new File([content], "immortal_restore.env", { type: "text/plain" }),
		);
	} catch {}
	onStep({ id: "snapshotStock", status: "ok" });
}

async function loadState(ctx: Ctx): Promise<{
	home: string;
	dream: string;
	ddream: string;
}> {
	const { adb, cfg } = ctx;
	const out = (await sh(adb, `cat ${STATE_FILE} 2>/dev/null`)).stdout;
	const get = (key: string) => {
		const m = new RegExp(`^${key}=(.*)$`, "m").exec(out);
		return m?.[1]?.trim() ?? "";
	};
	return {
		home: get("STOCK_HOME") || cfg.stockHome,
		dream: get("STOCK_DREAM") || cfg.stockDream,
		ddream: get("STOCK_DEFAULT_DREAM") || cfg.stockDefaultDream,
	};
}

async function setLauncher(ctx: Ctx, enabled: boolean): Promise<void> {
	const { adb, cfg, onStep } = ctx;
	if (!enabled) {
		onStep({ id: "setLauncher", status: "skip" });
		return;
	}
	onStep({ id: "setLauncher", status: "running" });
	const r = await sh(adb, `cmd package set-home-activity ${cfg.homeActivity}`);
	onStep({
		id: "setLauncher",
		status: r.exitCode === 0 ? "ok" : "warn",
		detail: cfg.homeActivity,
	});
}

async function setScreensaver(ctx: Ctx): Promise<void> {
	const { adb, cfg, onStep } = ctx;
	if (!cfg.setScreensaver) {
		onStep({ id: "setScreensaver", status: "skip" });
		return;
	}
	onStep({ id: "setScreensaver", status: "running" });
	await sh(
		adb,
		`settings put secure screensaver_components ${cfg.dreamService}`,
	);
	await sh(
		adb,
		`settings put secure screensaver_default_component ${cfg.dreamService}`,
	);
	await sh(adb, "settings put secure screensaver_enabled 1");
	await sh(adb, "settings put secure screensaver_activate_on_dock 1");
	await sh(adb, "settings put secure screensaver_activate_on_sleep 1");
	onStep({ id: "setScreensaver", status: "ok", detail: cfg.dreamService });
}

async function enableFleet(
	ctx: Ctx,
	enabled: boolean,
	fleetName?: string,
): Promise<FleetInventory | null> {
	const { adb, cfg, onStep } = ctx;
	if (!enabled) {
		onStep({ id: "enableFleet", status: "skip" });
		return null;
	}
	onStep({ id: "enableFleet", status: "running" });
	const dir = `/sdcard/Android/data/${cfg.pkg}/files/fleet`;
	await makeDirectory(adb, dir).catch(() => {});
	const name = (fleetName ?? cfg.fleetName ?? "").trim();
	const json = name
		? `{"enabled":true,"name":${JSON.stringify(name)}}`
		: '{"enabled":true}';
	try {
		await pushFile(
			adb,
			dir,
			new File([json], "provision.json", { type: "application/json" }),
		);
	} catch {}
	await sh(adb, `am force-stop ${cfg.pkg}`);
	await sh(adb, `am start -n ${cfg.homeActivity}`);
	let manifest = "";
	for (let t = 0; t < 15; t++) {
		manifest = (await sh(adb, `cat '${dir}/agent.json' 2>/dev/null`)).stdout;
		if (manifest.includes('"enabled":true')) break;
		await sleep(1000);
	}
	const token = /"token":"([0-9a-f]*)"/.exec(manifest)?.[1] ?? "";
	if (!token) {
		onStep({ id: "enableFleet", status: "warn", code: "fleetNoToken" });
		return null;
	}
	const port = /"port":(\d+)/.exec(manifest)?.[1] ?? String(cfg.fleetAgentPort);
	const ip = (await getIpAddress(adb).catch(() => null)) ?? "";
	const serial = (await sh(adb, "getprop ro.serialno")).stdout.trim();
	const model = (await sh(adb, "getprop ro.product.model")).stdout.trim();
	const resolvedName = name || /"name":"([^"]*)"/.exec(manifest)?.[1] || model;
	onStep({
		id: "enableFleet",
		status: "ok",
		detail: ip ? `${resolvedName} @ ${ip}:${port}` : resolvedName,
	});
	return {
		serial,
		name: resolvedName,
		model,
		ip,
		agentPort: Number.parseInt(port, 10),
		token,
	};
}

async function configureBootApps(ctx: Ctx): Promise<void> {
	const { adb, cfg, onStep } = ctx;
	const dir = `/sdcard/Android/data/${cfg.pkg}/files`;
	await makeDirectory(adb, dir).catch(() => {});
	if (cfg.bootApps.length > 0) {
		onStep({ id: "configureBootApps", status: "running" });
		try {
			await pushFile(
				adb,
				dir,
				new File([`${cfg.bootApps.join("\n")}\n`], "boot_apps.txt", {
					type: "text/plain",
				}),
			);
		} catch {}
		onStep({
			id: "configureBootApps",
			status: "ok",
			detail: cfg.bootApps.join(" "),
		});
	} else {
		await sh(adb, `rm -f '${dir}/boot_apps.txt'`);
		onStep({ id: "configureBootApps", status: "skip" });
	}
}

async function restoreAlexa(ctx: Ctx): Promise<void> {
	const { adb, cfg, sdk, onStep } = ctx;
	const fp = cfg.falconPkg;
	const setup = `${fp}/com.amazon.alexa.multimodal.LaunchActivity`;
	if (sdk >= 29) {
		onStep({ id: "restoreAlexa", status: "skip", code: "alexaA10" });
		return;
	}
	if (!cfg.falconPatchedUrl) {
		onStep({ id: "restoreAlexa", status: "warn", code: "alexaNoUrl" });
		return;
	}
	onStep({ id: "restoreAlexa", status: "running" });
	let installFailed = false;
	try {
		await installFromUrl(
			adb,
			[cfg.falconPatchedUrl],
			(_stage, percent) =>
				onStep({
					id: "restoreAlexa",
					status: "running",
					detail: percent != null ? `falcon ${percent}%` : "falcon",
				}),
			cfg.falconResultSha256 || undefined,
			"-r",
		);
	} catch {
		installFailed = true;
	}
	if (installFailed) {
		const present = (await sh(adb, `pm path ${fp}`)).stdout.includes(
			"package:",
		);
		if (!present) {
			onStep({
				id: "restoreAlexa",
				status: "warn",
				code: "alexaFalconInstall",
			});
			return;
		}
	}
	await sh(adb, `pm grant ${fp} android.permission.READ_PHONE_STATE`);
	await sh(adb, `pm grant ${fp} android.permission.INTERACT_ACROSS_USERS`);
	await sh(adb, `pm grant ${fp} android.permission.RECORD_AUDIO`);
	await sh(adb, "settings put secure user_setup_complete 1");
	await sh(adb, `appops set ${fp} SYSTEM_ALERT_WINDOW allow`);
	await clearLogcat(adb).catch(() => {});
	await sh(adb, `dumpsys deviceidle whitelist +${fp}`);
	await sh(adb, `am start -n ${setup}`);
	const mp = cfg.millenniumPkg;
	if (cfg.millenniumApkUrl) {
		try {
			await installFromUrl(adb, [cfg.millenniumApkUrl]);
		} catch {}
	}
	await sh(adb, `pm grant ${mp} android.permission.RECORD_AUDIO`);
	let ready = false;
	let regAt = -1;
	let lastKick = -100;
	for (let i = 0; i < 72; i++) {
		const log = await dumpLogcat(adb).catch(() => "");
		if (log.includes("in ReadyState")) {
			ready = true;
			break;
		}
		if (regAt < 0 && log.includes("AccountRegisteredCondition: isMet")) {
			regAt = i;
			onStep({ id: "restoreAlexa", status: "running", detail: "linked" });
		}
		if (regAt >= 0 && i - regAt >= 4 && i - lastKick >= 8) {
			await sh(adb, `am force-stop ${fp}`);
			await sh(adb, `am start -n ${setup}`);
			lastKick = i;
		}
		await sleep(5000);
	}
	if (ready) {
		await sh(adb, `am start -n ${mp}/com.millennium.ui.HeyActivity`);
		onStep({ id: "restoreAlexa", status: "ok" });
	} else {
		onStep({ id: "restoreAlexa", status: "warn", code: "alexaTimeout" });
	}
}

export async function provision(
	adb: Adb,
	cfg: ProvisionConfig,
	opts: ProvisionOptions,
	onStep: OnStep,
): Promise<ProvisionResult> {
	const sdk = await readSdk(adb);
	const ctx: Ctx = { adb, cfg, sdk, onStep };
	await installClient(ctx);
	if (opts.installShizuku) await startShizuku(ctx);
	else onStep({ id: "startShizuku", status: "skip" });
	if (opts.runPreinstalls) await installApps(ctx);
	else onStep({ id: "installApps", status: "skip" });
	await pushAssets(ctx, opts.photos);
	await grantPerms(ctx);
	await applySystemTweaks(ctx);
	await disableVerifier(ctx);
	await disableInstallerOverlay(ctx);
	await disableOta(ctx, opts.disableOta);
	await disablePresence(ctx, opts.disablePresence);
	await snapshotStock(ctx);
	await setLauncher(ctx, opts.setLauncher);
	await setScreensaver(ctx);
	const fleet = await enableFleet(ctx, opts.enableFleet, opts.fleetName);
	await configureBootApps(ctx);
	if (opts.restoreAlexa) await restoreAlexa(ctx);
	await sh(adb, "input keyevent KEYCODE_HOME");
	onStep({ id: "finish", status: "ok" });
	return { fleet };
}

export async function restore(
	adb: Adb,
	cfg: ProvisionConfig,
	onStep: OnStep,
): Promise<void> {
	const sdk = await readSdk(adb);
	const ctx: Ctx = { adb, cfg, sdk, onStep };
	const stock = await loadState(ctx);

	onStep({ id: "restoreSystem", status: "running" });
	await sh(adb, "settings delete global policy_control");
	await sh(adb, "settings delete secure ui_night_mode");
	await sh(adb, "settings delete global hidden_api_policy_pre_p_apps");
	await sh(adb, "settings delete global hidden_api_policy_p_apps");
	await sh(adb, "settings delete global hidden_api_policy");
	await sh(adb, "settings put global development_settings_enabled 0");
	onStep({ id: "restoreSystem", status: "ok" });

	onStep({ id: "restoreVerifier", status: "running" });
	await sh(adb, `pm enable ${cfg.verifierPkg}`);
	await sh(adb, "settings put global package_verifier_enable 1");
	onStep({ id: "restoreVerifier", status: "ok" });

	onStep({ id: "restoreOverlay", status: "running" });
	const present = (await sh(adb, "cmd overlay list 2>/dev/null")).stdout;
	for (const ov of cfg.installerOverlayPkgs) {
		if (present.includes(ov))
			await sh(adb, `cmd overlay enable --user 0 ${ov}`);
	}
	await sh(adb, "settings delete global immortal_overlay_fix");
	onStep({ id: "restoreOverlay", status: "ok" });

	onStep({ id: "restoreOta", status: "running" });
	for (const pkg of cfg.otaPackages) await sh(adb, `pm enable ${pkg}`);
	onStep({ id: "restoreOta", status: "ok" });

	if (cfg.presencePkg) {
		onStep({ id: "restorePresence", status: "running" });
		await sh(adb, `pm enable ${cfg.presencePkg}`);
		onStep({ id: "restorePresence", status: "ok" });
	}

	onStep({ id: "restoreDeviceAdmin", status: "running" });
	const rm = await sh(adb, `dpm remove-active-admin ${cfg.pkg}/.AdminReceiver`);
	onStep({
		id: "restoreDeviceAdmin",
		status: /success|removed/i.test(rm.stdout) ? "ok" : "warn",
		code: /success|removed/i.test(rm.stdout) ? undefined : "deviceAdminRemove",
	});
	await sh(
		adb,
		`cmd notification disallow_listener ${cfg.pkg}/${MEDIA_LISTENER}`,
	);
	await sh(adb, `rm -f /sdcard/Android/data/${cfg.pkg}/files/boot_apps.txt`);

	const mp = cfg.millenniumPkg;
	if ((await sh(adb, `pm path ${mp}`)).stdout.includes("package:")) {
		onStep({ id: "restoreAlexaUndo", status: "running" });
		await sh(adb, `pm uninstall ${mp}`);
		onStep({ id: "restoreAlexaUndo", status: "ok", code: "alexaFalconKept" });
	}

	onStep({ id: "restoreLauncher", status: "running" });
	await sh(adb, `cmd package set-home-activity ${stock.home}`);
	onStep({ id: "restoreLauncher", status: "ok", detail: stock.home });

	onStep({ id: "restoreScreensaver", status: "running" });
	await sh(adb, `settings put secure screensaver_components ${stock.dream}`);
	await sh(
		adb,
		`settings put secure screensaver_default_component ${stock.ddream}`,
	);
	onStep({ id: "restoreScreensaver", status: "ok" });

	await sh(adb, "input keyevent KEYCODE_HOME");
	onStep({ id: "finish", status: "ok" });
}

export async function status(
	adb: Adb,
	cfg: ProvisionConfig,
): Promise<ProvisionStatus> {
	const pc = (await sh(adb, "settings get global policy_control")).stdout;
	const dm = (await sh(adb, "settings get secure ui_night_mode")).stdout.trim();
	const homeOut = (
		await sh(
			adb,
			"cmd package resolve-activity -a android.intent.action.MAIN -c android.intent.category.HOME",
		)
	).stdout;
	const homeMatch = /packageName=(\S+)/.exec(homeOut);
	const screensaver = (
		await sh(adb, "settings get secure screensaver_components")
	).stdout.trim();
	const verifierDisabled = (
		await sh(adb, `pm list packages -d ${cfg.verifierPkg}`)
	).stdout.includes(cfg.verifierPkg);
	const overlayFix =
		(
			await sh(adb, "settings get global immortal_overlay_fix")
		).stdout.trim() === "1";
	const otaDisabled = /alohaotasetup|otaui/.test(
		(await sh(adb, "pm list packages -d")).stdout,
	);
	const clientInstalled = (
		await sh(adb, `pm list packages ${cfg.pkg}`)
	).stdout.includes(`package:${cfg.pkg}`);
	return {
		statusBar: pc.includes("immersive") ? "hidden" : "stock",
		darkMode: dm === "2",
		home: homeMatch?.[1] ?? "",
		screensaver,
		verifier: verifierDisabled ? "disabled" : "enabled",
		installerDialog: overlayFix ? "fixed" : "stock",
		osUpdates: otaDisabled ? "disabled" : "enabled",
		client: clientInstalled ? "installed" : "not installed",
	};
}

export async function runApps(
	adb: Adb,
	cfg: ProvisionConfig,
	onStep: OnStep,
): Promise<void> {
	const sdk = await readSdk(adb);
	await installApps({ adb, cfg, sdk, onStep });
}

export async function overlayFix(
	adb: Adb,
	cfg: ProvisionConfig,
	onStep: OnStep,
): Promise<void> {
	const sdk = await readSdk(adb);
	await disableInstallerOverlay({ adb, cfg, sdk, onStep });
}

export async function runShizuku(
	adb: Adb,
	cfg: ProvisionConfig,
	onStep: OnStep,
): Promise<void> {
	const sdk = await readSdk(adb);
	await startShizuku({ adb, cfg, sdk, onStep });
}

export async function runFleet(
	adb: Adb,
	cfg: ProvisionConfig,
	onStep: OnStep,
	fleetName?: string,
): Promise<FleetInventory | null> {
	const sdk = await readSdk(adb);
	return enableFleet({ adb, cfg, sdk, onStep }, true, fleetName);
}

export async function runAlexa(
	adb: Adb,
	cfg: ProvisionConfig,
	onStep: OnStep,
): Promise<void> {
	const sdk = await readSdk(adb);
	await restoreAlexa({ adb, cfg, sdk, onStep });
}

export async function resetLauncher(
	adb: Adb,
	cfg: ProvisionConfig,
): Promise<string> {
	const sdk = await readSdk(adb);
	const stock = await loadState({ adb, cfg, sdk, onStep: () => {} });
	await sh(adb, `cmd package set-home-activity ${stock.home}`);
	await sh(adb, "input keyevent KEYCODE_HOME");
	return stock.home;
}
