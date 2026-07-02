/// <reference path="./program-sdk.d.ts" />
//
// Starter OpenPortal setup program. Copy this to provisioning/openportal.js in
// your release (verified partner) or to your app's catalog folder (first-party),
// then fill in the steps. OpenPortal runs it in a sandboxed worker. See
// sdk/README.md for the full contract, and
// catalog/apps/immortal-launcher/openportal.js for a complete example.

/** @type {ProgramManifest} */
export const manifest = {
	// Bump only when you rely on host features newer than the user's OpenPortal.
	apiVersion: 2,
	name: "My app setup",
	// Step ids in display order (must match the ids you pass to portal.step()).
	steps: ["install", "configure", "finish"],
	// Optional guidance rendered above the form.
	presentation: {
		intro: "What this setup does, in one line.",
	},
	fields: [
		{
			key: "enableThing",
			type: "boolean",
			label: "Enable the thing",
			default: true,
		},
	],
};

/**
 * Initial answers, computed from the device.
 * @param {Portal} portal
 * @returns {ProgramAnswers}
 */
export function defaultOptions(portal) {
	return { enableThing: portal.sdk >= 29 };
}

/**
 * @param {Portal} portal
 * @param {ProgramAnswers} answers
 * @returns {Promise<ProgramResult>}
 */
export async function provision(portal, answers) {
	const pkg = portal.app.packageName;

	portal.step("install", "running");
	// Install from your latest GitHub release (or call installFromUrl directly).
	const urls = await portal.resolveGithubLatest("owner/repo");
	await portal.installFromUrl(urls, { flags: "-r" });
	portal.step("install", "ok", pkg);

	portal.step("configure", "running");
	if (answers.enableThing) {
		// `shell` is the escape hatch: grant a permission, flip a setting, launch…
		await portal.shell(`pm grant ${pkg} android.permission.WRITE_SECURE_SETTINGS`);
		await portal.shell("settings put secure some_flag 1");
		await portal.shell(`monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`);
	}
	portal.step("configure", "ok");

	portal.step("finish", "ok");
	// Optionally return links/text/JSON for the panel to render after the run.
	return { fleet: null };
}

/**
 * Optional: undo the setup (run before uninstall).
 * @param {Portal} portal
 */
export async function restore(portal) {
	await portal.shell("settings put secure some_flag 0");
	portal.step("finish", "ok");
}
