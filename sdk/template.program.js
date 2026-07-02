/// <reference path="./program-sdk.d.ts" />
//
// Starter OpenPortal provisioning program. Copy this to
// provisioning/openportal.program.js in your release, then fill in the steps.
// OpenPortal fetches it live from your latest release tag and runs it in a
// sandboxed worker. See sdk/README.md for the full contract, and
// catalog/apps/immortal-launcher/program.js for a complete example.

/** @type {ProgramManifest} */
export const manifest = {
	// Bump only when you rely on host features newer than the user's OpenPortal.
	apiVersion: 1,
	name: "My launcher",
	// Step ids in display order (must match the ids you pass to portal.step()).
	steps: ["installClient", "grantPerms", "finish"],
	fields: [
		{ key: "setLauncher", type: "boolean", label: "Set as the home launcher" },
		{
			key: "restoreAlexa",
			type: "boolean",
			label: "Restore on-device Alexa",
			// Shown but disabled on Android 10+.
			enabledWhen: { sdkLessThan: 29 },
			disabledHint: "Only available on Portals running Android 9.",
		},
	],
};

/**
 * Initial answers, computed from the live config and the device.
 * @param {Portal} portal
 * @returns {ProgramAnswers}
 */
export function defaultOptions(portal) {
	return {
		setLauncher: portal.cfg.setLauncher,
		restoreAlexa: false,
	};
}

/**
 * @param {Portal} portal
 * @param {ProgramAnswers} answers
 * @returns {Promise<ProgramResult>}
 */
export async function provision(portal, answers) {
	portal.step("installClient", "running");
	const urls = await portal.resolveGithubLatest(portal.cfg.releaseRepo);
	await portal.installFromUrl(urls, { flags: "-r -d" });
	portal.step("installClient", "ok", portal.cfg.pkg);

	portal.step("grantPerms", "running");
	await portal.shell(
		`appops set ${portal.cfg.pkg} REQUEST_INSTALL_PACKAGES allow`,
	);
	portal.step("grantPerms", "ok");

	if (answers.setLauncher) {
		await portal.shell(`cmd package set-home-activity ${portal.cfg.homeActivity}`);
	}

	portal.step("finish", "ok");
	return { fleet: null };
}

/** @param {Portal} portal */
export async function restore(portal) {
	await portal.shell("settings put global package_verifier_enable 1");
	portal.step("finish", "ok");
}

/**
 * @param {Portal} portal
 * @returns {Promise<ProgramStatus>}
 */
export async function status(portal) {
	const installed = (
		await portal.shell(`pm list packages ${portal.cfg.pkg}`)
	).stdout.includes(`package:${portal.cfg.pkg}`);
	return {
		statusBar: "stock",
		darkMode: false,
		home: "",
		screensaver: "",
		verifier: "enabled",
		installerDialog: "stock",
		osUpdates: "enabled",
		client: installed ? "installed" : "not installed",
	};
}

/**
 * @param {Portal} portal
 * @returns {Promise<string>}
 */
export async function resetLauncher(portal) {
	await portal.shell(`cmd package set-home-activity ${portal.cfg.stockHome}`);
	return portal.cfg.stockHome;
}
