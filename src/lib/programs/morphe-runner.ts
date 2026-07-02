import { installApp } from "@/lib/adb/install";
import { deviceFetchText } from "@/lib/adb/online-install";
import { getprop } from "@/lib/adb/shell";
import {
	MORPHE_MANIFEST_URLS,
	type MorpheManifestApp,
	verifyAndParseManifest,
} from "@/lib/catalog/morphe";
import type { Adb } from "@yume-chan/adb";
import type { OnStep } from "./types";

/**
 * Picks the manifest entry whose ABI matches the device, falling back to a
 * universal build (or the first entry). Reads the device ABIs with getprop.
 */
async function pickArch(
	adb: Adb,
	entries: MorpheManifestApp[],
): Promise<MorpheManifestApp | undefined> {
	if (entries.length <= 1) return entries[0];
	let abis: string[] = [];
	try {
		const primary = (await getprop(adb, "ro.product.cpu.abi")).trim();
		const list = (await getprop(adb, "ro.product.cpu.abilist")).trim();
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

/**
 * Installs a Morphe (modded) app entirely on the host: fetch the signed manifest
 * from the device (bypasses browser CORS), verify its Ed25519 signature against
 * OpenPortal's pinned key, pick the arch-matched build, and install it with a
 * sha256 check. This used to run as a sandboxed program, but Morphe is
 * first-party and the signature check was already host-side, so the sandbox
 * added nothing — the pinned key never leaves the host either way.
 */
export async function installMorpheApp(
	adb: Adb,
	packageName: string,
	onStep: OnStep = () => {},
): Promise<void> {
	onStep({
		id: "fetch",
		status: "running",
		detail: "Fetching the Morphe manifest",
	});
	let text: string | undefined;
	let lastError: unknown;
	for (const url of MORPHE_MANIFEST_URLS) {
		try {
			text = await deviceFetchText(adb, url);
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
	const parsed = await verifyAndParseManifest(text);
	onStep({ id: "fetch", status: "ok" });

	const entries = parsed.apps.filter(
		(entry) => entry.packageName === packageName,
	);
	const entry = await pickArch(adb, entries);
	if (!entry) throw new Error("This app is not in the Morphe manifest");
	if (!entry.urls || entry.urls.length === 0) {
		throw new Error("No download URL in the Morphe manifest");
	}

	onStep({
		id: "install",
		status: "running",
		detail: `Installing ${packageName}`,
	});
	await installApp(adb, {
		kind: "url",
		urls: entry.urls,
		sha256: entry.sha256,
	});
	onStep({ id: "install", status: "ok" });
}
