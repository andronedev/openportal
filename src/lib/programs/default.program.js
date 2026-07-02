// OpenPortal provisioning program (API v1).
//
// This is the built-in reference program: a faithful translation of Immortal's
// provisioning/provision.sh against the OpenPortal `portal` capability API. It
// is the offline fallback and the example for the SDK in /sdk. When Immortal
// publishes provisioning/openportal.program.js in a release, OpenPortal fetches
// that one live instead. See sdk/README.md for the contract.

const STATE_FILE = "/sdcard/immortal_restore.env";
const MEDIA_LISTENER =
	"com.immortal.launcher.MediaNotificationListenerService";
const SHIZUKU_PKG = "moe.shizuku.privileged.api";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sh(portal, command, timeoutMs = 30000) {
	try {
		return await portal.shell(command, { timeoutMs });
	} catch {
		return { stdout: "", exitCode: 1 };
	}
}

async function installClient(portal) {
	const cfg = portal.cfg;
	portal.step("installClient", "running");
	try {
		const urls = cfg.releaseApkUrl
			? [cfg.releaseApkUrl]
			: await portal.resolveGithubLatest(cfg.releaseRepo);
		await portal.installFromUrl(urls, {
			flags: "-r -d",
			onProgress: (_stage, percent) =>
				portal.step(
					"installClient",
					"running",
					percent != null ? `${percent}%` : undefined,
				),
		});
		portal.step("installClient", "ok", cfg.pkg);
	} catch (err) {
		portal.step(
			"installClient",
			"error",
			err instanceof Error ? err.message : String(err),
		);
		throw err;
	}
}

async function startShizuku(portal) {
	const cfg = portal.cfg;
	if (cfg.shizukuApkUrl.length === 0) {
		portal.step("startShizuku", "skip");
		return;
	}
	portal.step("startShizuku", "running");
	const installed = (
		await sh(portal, `pm list packages ${SHIZUKU_PKG}`)
	).stdout.includes(`package:${SHIZUKU_PKG}`);
	if (!installed) {
		try {
			await portal.installFromUrl([cfg.shizukuApkUrl]);
		} catch {
			portal.step("startShizuku", "warn", undefined, "shizukuInstall");
			return;
		}
	}
	const apkpath = (await sh(portal, `pm path ${SHIZUKU_PKG}`)).stdout
		.replace(/^package:/, "")
		.split("\n")[0]
		?.trim();
	if (!apkpath) {
		portal.step("startShizuku", "warn", undefined, "shizukuStarter");
		return;
	}
	const apkdir = (await sh(portal, `dirname '${apkpath}'`)).stdout.trim();
	const starter = (
		await sh(portal, `ls ${apkdir}/lib/*/libshizuku.so 2>/dev/null`)
	).stdout
		.split("\n")[0]
		?.trim();
	if (!starter) {
		portal.step("startShizuku", "warn", undefined, "shizukuStarter");
		return;
	}
	await sh(portal, starter);
	for (let i = 0; i < 6; i++) {
		const alive = (await sh(portal, "pgrep -f shizuku_server")).stdout.trim();
		if (alive.length > 0) {
			portal.step("startShizuku", "ok");
			return;
		}
		await sleep(1000);
	}
	portal.step("startShizuku", "warn", undefined, "shizukuStay");
}

async function installApps(portal) {
	const cfg = portal.cfg;
	if (cfg.preinstallFdroid.length === 0 && cfg.preinstallApks.length === 0) {
		portal.step("installApps", "skip");
		return;
	}
	let n = 0;
	for (const spec of cfg.preinstallFdroid) {
		const [id, vc] = spec.split(":");
		if (!id) continue;
		portal.step("installApps", "running", id);
		try {
			const urls = vc
				? [`https://f-droid.org/repo/${id}_${vc}.apk`]
				: await portal.resolveFdroidLatest(id);
			await portal.installFromUrl(urls);
			n++;
		} catch {}
	}
	for (const url of cfg.preinstallApks) {
		portal.step("installApps", "running", url);
		try {
			await portal.installFromUrl([url]);
			n++;
		} catch {}
	}
	portal.step("installApps", "ok", `${n}`);
}

async function pushAssets(portal) {
	const dir = `/sdcard/Android/data/${portal.cfg.pkg}/files`;
	const n = await portal.pushUserPhotos(dir);
	portal.step("pushAssets", n > 0 ? "ok" : "skip", n > 0 ? `${n}` : undefined);
}

async function grantPerms(portal) {
	const cfg = portal.cfg;
	const p = cfg.pkg;
	portal.step("grantPerms", "running");
	for (const perm of cfg.permissions) await sh(portal, `pm grant ${p} ${perm}`);
	await sh(portal, `pm grant ${p} android.permission.WRITE_SECURE_SETTINGS`);
	await sh(portal, `pm grant ${p} android.permission.READ_EXTERNAL_STORAGE`);
	await sh(portal, `pm grant ${p} android.permission.WRITE_EXTERNAL_STORAGE`);
	await sh(portal, `pm grant ${p} android.permission.READ_LOGS`);
	await sh(portal, `appops set ${p} SYSTEM_ALERT_WINDOW allow`);
	await sh(portal, `appops set ${p} REQUEST_INSTALL_PACKAGES allow`);
	await sh(portal, `appops set ${p} GET_USAGE_STATS allow`);
	const admin = await sh(portal, `dpm set-active-admin ${p}/.AdminReceiver`);
	const adminOk = /success/i.test(admin.stdout);
	await sh(portal, `cmd notification allow_listener ${p}/${MEDIA_LISTENER}`);
	portal.step(
		"grantPerms",
		adminOk ? "ok" : "warn",
		undefined,
		adminOk ? undefined : "deviceAdmin",
	);
}

async function applySystemTweaks(portal) {
	portal.step("applySystemTweaks", "running");
	await sh(portal, 'settings put global policy_control "immersive.status=*"');
	await sh(portal, "settings put global hidden_api_policy_pre_p_apps 1");
	await sh(portal, "settings put global hidden_api_policy_p_apps 1");
	await sh(portal, "settings put global hidden_api_policy 1");
	await sh(portal, "settings put global development_settings_enabled 1");
	portal.step("applySystemTweaks", "ok");
}

async function disableVerifier(portal) {
	const cfg = portal.cfg;
	if (!cfg.disableVerifier) {
		portal.step("disableVerifier", "skip");
		return;
	}
	portal.step("disableVerifier", "running");
	await sh(portal, `pm disable-user --user 0 ${cfg.verifierPkg}`);
	await sh(portal, "settings put global package_verifier_enable 0");
	portal.step("disableVerifier", "ok");
}

async function disableInstallerOverlay(portal) {
	const cfg = portal.cfg;
	if (!cfg.disableInstallerOverlay || portal.sdk >= 29) {
		portal.step("disableInstallerOverlay", "skip");
		return;
	}
	portal.step("disableInstallerOverlay", "running");
	const present = (await sh(portal, "cmd overlay list 2>/dev/null")).stdout;
	let did = false;
	for (const ov of cfg.installerOverlayPkgs) {
		if (!present.includes(ov)) continue;
		await sh(portal, `cmd overlay disable --user 0 ${ov}`);
		did = true;
	}
	if (did) {
		await sh(portal, "settings put global immortal_overlay_fix 1");
		portal.step("disableInstallerOverlay", "ok");
	} else {
		portal.step("disableInstallerOverlay", "warn", undefined, "noOverlay");
	}
}

async function disableOta(portal, enabled) {
	const cfg = portal.cfg;
	if (!enabled) {
		portal.step("disableOta", "skip");
		return;
	}
	portal.step("disableOta", "running");
	for (const pkg of cfg.otaPackages) {
		await sh(portal, `pm disable-user --user 0 ${pkg}`);
	}
	portal.step("disableOta", "ok");
}

async function disablePresence(portal, enabled) {
	const cfg = portal.cfg;
	if (!enabled || !cfg.presencePkg) {
		portal.step("disablePresence", "skip");
		return;
	}
	portal.step("disablePresence", "running");
	await sh(portal, `pm disable-user --user 0 ${cfg.presencePkg}`);
	portal.step("disablePresence", "ok");
}

function resolveStockHome(query, pkg) {
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

async function snapshotStock(portal) {
	const cfg = portal.cfg;
	const exists = (await sh(portal, `[ -f ${STATE_FILE} ] && echo yes`)).stdout;
	if (exists.includes("yes")) {
		portal.step("snapshotStock", "skip");
		return;
	}
	portal.step("snapshotStock", "running");
	const query = (
		await sh(
			portal,
			"cmd package query-activities --components -a android.intent.action.MAIN -c android.intent.category.HOME",
		)
	).stdout;
	let home = resolveStockHome(query, cfg.pkg) || cfg.stockHome;
	let dream = (
		await sh(portal, "settings get secure screensaver_components")
	).stdout.trim();
	let ddream = (
		await sh(portal, "settings get secure screensaver_default_component")
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
		await portal.pushText("/sdcard", "immortal_restore.env", content);
	} catch {}
	portal.step("snapshotStock", "ok");
}

async function loadState(portal) {
	const cfg = portal.cfg;
	const out = (await sh(portal, `cat ${STATE_FILE} 2>/dev/null`)).stdout;
	const get = (key) => {
		const m = new RegExp(`^${key}=(.*)$`, "m").exec(out);
		return m?.[1]?.trim() ?? "";
	};
	return {
		home: get("STOCK_HOME") || cfg.stockHome,
		dream: get("STOCK_DREAM") || cfg.stockDream,
		ddream: get("STOCK_DEFAULT_DREAM") || cfg.stockDefaultDream,
	};
}

async function setLauncher(portal, enabled) {
	const cfg = portal.cfg;
	if (!enabled) {
		portal.step("setLauncher", "skip");
		return;
	}
	portal.step("setLauncher", "running");
	const r = await sh(portal, `cmd package set-home-activity ${cfg.homeActivity}`);
	portal.step("setLauncher", r.exitCode === 0 ? "ok" : "warn", cfg.homeActivity);
}

async function setScreensaver(portal) {
	const cfg = portal.cfg;
	if (!cfg.setScreensaver) {
		portal.step("setScreensaver", "skip");
		return;
	}
	portal.step("setScreensaver", "running");
	await sh(
		portal,
		`settings put secure screensaver_components ${cfg.dreamService}`,
	);
	await sh(
		portal,
		`settings put secure screensaver_default_component ${cfg.dreamService}`,
	);
	await sh(portal, "settings put secure screensaver_enabled 1");
	await sh(portal, "settings put secure screensaver_activate_on_dock 1");
	await sh(portal, "settings put secure screensaver_activate_on_sleep 1");
	portal.step("setScreensaver", "ok", cfg.dreamService);
}

async function enableFleet(portal, enabled, fleetName) {
	const cfg = portal.cfg;
	if (!enabled) {
		portal.step("enableFleet", "skip");
		return null;
	}
	portal.step("enableFleet", "running");
	const dir = `/sdcard/Android/data/${cfg.pkg}/files/fleet`;
	await portal.makeDirectory(dir).catch(() => {});
	const name = (fleetName ?? cfg.fleetName ?? "").trim();
	const json = name
		? `{"enabled":true,"name":${JSON.stringify(name)}}`
		: '{"enabled":true}';
	try {
		await portal.pushText(dir, "provision.json", json);
	} catch {}
	await sh(portal, `am force-stop ${cfg.pkg}`);
	await sh(portal, `am start -n ${cfg.homeActivity}`);
	let agentJson = "";
	for (let t = 0; t < 15; t++) {
		agentJson = (await sh(portal, `cat '${dir}/agent.json' 2>/dev/null`)).stdout;
		if (agentJson.includes('"enabled":true')) break;
		await sleep(1000);
	}
	const token = /"token":"([0-9a-f]*)"/.exec(agentJson)?.[1] ?? "";
	if (!token) {
		portal.step("enableFleet", "warn", undefined, "fleetNoToken");
		return null;
	}
	const port =
		/"port":(\d+)/.exec(agentJson)?.[1] ?? String(cfg.fleetAgentPort);
	const ip = (await portal.getIpAddress().catch(() => null)) ?? "";
	const serial = (await sh(portal, "getprop ro.serialno")).stdout.trim();
	const model = (await sh(portal, "getprop ro.product.model")).stdout.trim();
	const resolvedName = name || /"name":"([^"]*)"/.exec(agentJson)?.[1] || model;
	portal.step(
		"enableFleet",
		"ok",
		ip ? `${resolvedName} @ ${ip}:${port}` : resolvedName,
	);
	return {
		serial,
		name: resolvedName,
		model,
		ip,
		agentPort: Number.parseInt(port, 10),
		token,
	};
}

async function configureBootApps(portal) {
	const cfg = portal.cfg;
	const dir = `/sdcard/Android/data/${cfg.pkg}/files`;
	await portal.makeDirectory(dir).catch(() => {});
	if (cfg.bootApps.length > 0) {
		portal.step("configureBootApps", "running");
		try {
			await portal.pushText(dir, "boot_apps.txt", `${cfg.bootApps.join("\n")}\n`);
		} catch {}
		portal.step("configureBootApps", "ok", cfg.bootApps.join(" "));
	} else {
		await sh(portal, `rm -f '${dir}/boot_apps.txt'`);
		portal.step("configureBootApps", "skip");
	}
}

async function restoreAlexa(portal) {
	const cfg = portal.cfg;
	const fp = cfg.falconPkg;
	const setup = `${fp}/com.amazon.alexa.multimodal.LaunchActivity`;
	if (portal.sdk >= 29) {
		portal.step("restoreAlexa", "skip", undefined, "alexaA10");
		return;
	}
	if (!cfg.falconPatchedUrl) {
		portal.step("restoreAlexa", "warn", undefined, "alexaNoUrl");
		return;
	}
	portal.step("restoreAlexa", "running");
	let installFailed = false;
	try {
		await portal.installFromUrl([cfg.falconPatchedUrl], {
			sha256: cfg.falconResultSha256 || undefined,
			onProgress: (_stage, percent) =>
				portal.step(
					"restoreAlexa",
					"running",
					percent != null ? `falcon ${percent}%` : "falcon",
				),
		});
	} catch {
		installFailed = true;
	}
	if (installFailed) {
		const present = (await sh(portal, `pm path ${fp}`)).stdout.includes(
			"package:",
		);
		if (!present) {
			portal.step("restoreAlexa", "warn", undefined, "alexaFalconInstall");
			return;
		}
	}
	await sh(portal, `pm grant ${fp} android.permission.READ_PHONE_STATE`);
	await sh(portal, `pm grant ${fp} android.permission.INTERACT_ACROSS_USERS`);
	await sh(portal, `pm grant ${fp} android.permission.RECORD_AUDIO`);
	await sh(portal, "settings put secure user_setup_complete 1");
	await sh(portal, `appops set ${fp} SYSTEM_ALERT_WINDOW allow`);
	await portal.clearLogcat().catch(() => {});
	await sh(portal, `dumpsys deviceidle whitelist +${fp}`);
	await sh(portal, `am start -n ${setup}`);
	const mp = cfg.millenniumPkg;
	if (cfg.millenniumApkUrl) {
		try {
			await portal.installFromUrl([cfg.millenniumApkUrl]);
		} catch {}
	}
	await sh(portal, `pm grant ${mp} android.permission.RECORD_AUDIO`);
	let ready = false;
	let regAt = -1;
	let lastKick = -100;
	for (let i = 0; i < 72; i++) {
		const log = await portal.dumpLogcat().catch(() => "");
		if (log.includes("in ReadyState")) {
			ready = true;
			break;
		}
		if (regAt < 0 && log.includes("AccountRegisteredCondition: isMet")) {
			regAt = i;
			portal.step("restoreAlexa", "running", "linked");
		}
		if (regAt >= 0 && i - regAt >= 4 && i - lastKick >= 8) {
			await sh(portal, `am force-stop ${fp}`);
			await sh(portal, `am start -n ${setup}`);
			lastKick = i;
		}
		await sleep(5000);
	}
	if (ready) {
		await sh(portal, `am start -n ${mp}/com.millennium.ui.HeyActivity`);
		portal.step("restoreAlexa", "ok");
	} else {
		portal.step("restoreAlexa", "warn", undefined, "alexaTimeout");
	}
}

export const manifest = {
	apiVersion: 1,
	name: "Immortal launcher",
	steps: [
		"installClient",
		"startShizuku",
		"installApps",
		"pushAssets",
		"grantPerms",
		"applySystemTweaks",
		"disableVerifier",
		"disableInstallerOverlay",
		"disableOta",
		"disablePresence",
		"snapshotStock",
		"setLauncher",
		"setScreensaver",
		"enableFleet",
		"configureBootApps",
		"restoreAlexa",
		"finish",
	],
	fields: [
		{ key: "setLauncher", type: "boolean", label: "Set as the home launcher" },
		{
			key: "restoreAlexa",
			type: "boolean",
			label: "Restore on-device Alexa",
			enabledWhen: { sdkLessThan: 29 },
			disabledHint: "Only available on Portals running Android 9.",
		},
		{
			key: "disableOta",
			type: "boolean",
			advanced: true,
			label: "Block system updates",
		},
		{
			key: "installShizuku",
			type: "boolean",
			advanced: true,
			label: "Install Shizuku",
		},
		{
			key: "runPreinstalls",
			type: "boolean",
			advanced: true,
			label: "Pre-install the bundled apps",
		},
		{
			key: "disablePresence",
			type: "boolean",
			advanced: true,
			label: "Disable the presence sensor",
		},
		{
			key: "enableFleet",
			type: "boolean",
			advanced: true,
			label: "Enable the fleet agent",
		},
		{
			key: "fleetName",
			type: "text",
			advanced: true,
			label: "Fleet device name",
			placeholder: "Living room",
			showWhen: { whenOption: "enableFleet", equals: true },
		},
	],
};

export function defaultOptions(portal) {
	const cfg = portal.cfg;
	return {
		disableOta: cfg.disableOta ?? true,
		disablePresence: cfg.disablePresence,
		installShizuku: cfg.shizukuApkUrl.length > 0,
		runPreinstalls: true,
		setLauncher: cfg.setLauncher,
		enableFleet: cfg.enableFleet,
		fleetName: cfg.fleetName ?? "",
		restoreAlexa: (cfg.restoreAlexa ?? false) && portal.sdk < 29,
	};
}

export async function provision(portal, answers) {
	const a = answers ?? {};
	await installClient(portal);
	if (a.installShizuku) await startShizuku(portal);
	else portal.step("startShizuku", "skip");
	if (a.runPreinstalls) await installApps(portal);
	else portal.step("installApps", "skip");
	await pushAssets(portal);
	await grantPerms(portal);
	await applySystemTweaks(portal);
	await disableVerifier(portal);
	await disableInstallerOverlay(portal);
	await disableOta(portal, a.disableOta);
	await disablePresence(portal, a.disablePresence);
	await snapshotStock(portal);
	await setLauncher(portal, a.setLauncher);
	await setScreensaver(portal);
	const fleet = await enableFleet(portal, a.enableFleet, a.fleetName);
	await configureBootApps(portal);
	if (a.restoreAlexa) await restoreAlexa(portal);
	await sh(portal, "input keyevent KEYCODE_HOME");
	portal.step("finish", "ok");
	return { fleet };
}

export async function restore(portal) {
	const cfg = portal.cfg;
	const stock = await loadState(portal);

	portal.step("restoreSystem", "running");
	await sh(portal, "settings delete global policy_control");
	await sh(portal, "settings delete secure ui_night_mode");
	await sh(portal, "settings delete global hidden_api_policy_pre_p_apps");
	await sh(portal, "settings delete global hidden_api_policy_p_apps");
	await sh(portal, "settings delete global hidden_api_policy");
	await sh(portal, "settings put global development_settings_enabled 0");
	portal.step("restoreSystem", "ok");

	portal.step("restoreVerifier", "running");
	await sh(portal, `pm enable ${cfg.verifierPkg}`);
	await sh(portal, "settings put global package_verifier_enable 1");
	portal.step("restoreVerifier", "ok");

	portal.step("restoreOverlay", "running");
	const present = (await sh(portal, "cmd overlay list 2>/dev/null")).stdout;
	for (const ov of cfg.installerOverlayPkgs) {
		if (present.includes(ov)) {
			await sh(portal, `cmd overlay enable --user 0 ${ov}`);
		}
	}
	await sh(portal, "settings delete global immortal_overlay_fix");
	portal.step("restoreOverlay", "ok");

	portal.step("restoreOta", "running");
	for (const pkg of cfg.otaPackages) await sh(portal, `pm enable ${pkg}`);
	portal.step("restoreOta", "ok");

	if (cfg.presencePkg) {
		portal.step("restorePresence", "running");
		await sh(portal, `pm enable ${cfg.presencePkg}`);
		portal.step("restorePresence", "ok");
	}

	portal.step("restoreDeviceAdmin", "running");
	const rm = await sh(
		portal,
		`dpm remove-active-admin ${cfg.pkg}/.AdminReceiver`,
	);
	const removed = /success|removed/i.test(rm.stdout);
	portal.step(
		"restoreDeviceAdmin",
		removed ? "ok" : "warn",
		undefined,
		removed ? undefined : "deviceAdminRemove",
	);
	await sh(
		portal,
		`cmd notification disallow_listener ${cfg.pkg}/${MEDIA_LISTENER}`,
	);
	await sh(portal, `rm -f /sdcard/Android/data/${cfg.pkg}/files/boot_apps.txt`);

	const mp = cfg.millenniumPkg;
	if ((await sh(portal, `pm path ${mp}`)).stdout.includes("package:")) {
		portal.step("restoreAlexaUndo", "running");
		await sh(portal, `pm uninstall ${mp}`);
		portal.step("restoreAlexaUndo", "ok", undefined, "alexaFalconKept");
	}

	portal.step("restoreLauncher", "running");
	await sh(portal, `cmd package set-home-activity ${stock.home}`);
	portal.step("restoreLauncher", "ok", stock.home);

	portal.step("restoreScreensaver", "running");
	await sh(portal, `settings put secure screensaver_components ${stock.dream}`);
	await sh(
		portal,
		`settings put secure screensaver_default_component ${stock.ddream}`,
	);
	portal.step("restoreScreensaver", "ok");

	await sh(portal, "input keyevent KEYCODE_HOME");
	portal.step("finish", "ok");
}

export async function status(portal) {
	const cfg = portal.cfg;
	const pc = (await sh(portal, "settings get global policy_control")).stdout;
	const dm = (
		await sh(portal, "settings get secure ui_night_mode")
	).stdout.trim();
	const homeOut = (
		await sh(
			portal,
			"cmd package resolve-activity -a android.intent.action.MAIN -c android.intent.category.HOME",
		)
	).stdout;
	const homeMatch = /packageName=(\S+)/.exec(homeOut);
	const screensaver = (
		await sh(portal, "settings get secure screensaver_components")
	).stdout.trim();
	const verifierDisabled = (
		await sh(portal, `pm list packages -d ${cfg.verifierPkg}`)
	).stdout.includes(cfg.verifierPkg);
	const overlayFix =
		(
			await sh(portal, "settings get global immortal_overlay_fix")
		).stdout.trim() === "1";
	const otaDisabled = /alohaotasetup|otaui/.test(
		(await sh(portal, "pm list packages -d")).stdout,
	);
	const clientInstalled = (
		await sh(portal, `pm list packages ${cfg.pkg}`)
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

export async function resetLauncher(portal) {
	const stock = await loadState(portal);
	await sh(portal, `cmd package set-home-activity ${stock.home}`);
	await sh(portal, "input keyevent KEYCODE_HOME");
	return stock.home;
}
