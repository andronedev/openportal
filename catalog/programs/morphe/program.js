/// <reference path="../../../sdk/program-sdk.d.ts" />

export const manifest = {
	apiVersion: 1,
	name: "Morphe",
	fields: [],
	steps: ["fetch", "install"],
};

export function defaultOptions() {
	return {};
}

async function pickArch(portal, entries) {
	if (entries.length <= 1) return entries[0];
	let abis = [];
	try {
		const primary = (await portal.getprop("ro.product.cpu.abi")).trim();
		const list = (await portal.getprop("ro.product.cpu.abilist")).trim();
		abis = [primary, ...list.split(",")]
			.map((abi) => abi.trim())
			.filter((abi) => abi.length > 0);
	} catch {}
	for (const abi of abis) {
		const match = entries.find((entry) => entry.arch === abi);
		if (match) return match;
	}
	return (
		entries.find((entry) => !entry.arch || entry.arch === "universal") ??
		entries[0]
	);
}

/** @param {Portal} portal */
export async function provision(portal, answers) {
	const pkg = answers.packageName;
	const urls = (answers.manifestUrls || "").split("\n").filter(Boolean);
	if (!pkg) throw new Error("No package name given");

	portal.step("fetch", "running", "Fetching the Morphe manifest");
	let text;
	let lastError;
	for (const url of urls) {
		try {
			text = await portal.deviceFetchText(url);
			break;
		} catch (err) {
			lastError = err;
		}
	}
	if (text == null) {
		throw lastError instanceof Error
			? lastError
			: new Error("Could not fetch the Morphe manifest");
	}
	const parsed = await portal.verifyMorpheManifest(text);
	portal.step("fetch", "ok");

	const entries = parsed.apps.filter((entry) => entry.packageName === pkg);
	const entry = await pickArch(portal, entries);
	if (!entry) throw new Error("This app is not in the Morphe manifest");
	if (!entry.urls || entry.urls.length === 0) {
		throw new Error("No download URL in the Morphe manifest");
	}

	portal.step("install", "running", `Installing ${pkg}`);
	await portal.installFromUrl(entry.urls, { sha256: entry.sha256 });
	portal.step("install", "ok");

	return { fleet: null, installed: pkg, version: entry.version };
}
