/// <reference path="../../../sdk/program-sdk.d.ts" />
//
// Google Photos screensaver setup, as a first-party OpenPortal program. Mirrors
// the project's deploy.sh: push the user's OAuth credentials, grant the system
// permissions the app needs, and wire it up as the device's screensaver. The
// Google Cloud project + Photos Picker API step happens outside the app, so the
// presentation links to the upstream guide.

const GUIDE_URL = "https://github.com/ram-nat/portal-gphotos#readme";

export const manifest = {
	apiVersion: 2,
	name: "Google Photos screensaver",
	steps: ["pushCredentials", "grant", "screensaver", "launch"],
	presentation: {
		intro:
			"Show your Google Photos albums as a screensaver. This needs your own Google Cloud OAuth credentials.",
		steps: [
			"Create a Google Cloud project and enable the Photos Picker API.",
			"Configure the OAuth consent screen (External) and add yourself as a test user.",
			"Create a Desktop OAuth client and download its client_secret.json.",
		],
		link: { label: "Full setup guide", url: GUIDE_URL },
	},
	fields: [
		{
			key: "credentials",
			type: "file",
			label: "OAuth credentials (client_secret.json)",
			accept: "application/json,.json",
		},
	],
};

export function defaultOptions() {
	return {};
}

/**
 * @param {Portal} portal
 * @param {ProgramAnswers} answers
 */
export async function provision(portal, answers) {
	const pkg = portal.app.packageName;
	const filesDir = `/sdcard/Android/data/${pkg}/files`;

	portal.step("pushCredentials", "running");
	if (!answers.credentials) {
		portal.step("pushCredentials", "error", "No credentials file selected");
		throw new Error("Select your client_secret.json first");
	}
	// The app reads a file named exactly client_secret.json; the download from
	// Google Cloud has a different name, so it is placed under that name here.
	await portal.pushUploadedFile("credentials", filesDir, "client_secret.json");
	portal.step("pushCredentials", "ok");

	portal.step("grant", "running");
	await portal.shell(
		`pm grant ${pkg} android.permission.WRITE_SECURE_SETTINGS`,
	);
	await portal.shell(`appops set ${pkg} WRITE_SETTINGS allow`);
	portal.step("grant", "ok");

	portal.step("screensaver", "running");
	await portal.shell(
		`settings put secure screensaver_components ${pkg}/${pkg}.PhotoDreamService`,
	);
	await portal.shell("settings put secure screensaver_activate_on_sleep 1");
	portal.step("screensaver", "ok");

	portal.step("launch", "running");
	await portal.shell(`monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`);
	portal.step("launch", "ok");

	return { fleet: null };
}
