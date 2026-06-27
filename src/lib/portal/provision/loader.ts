import { deviceFetchText } from "@/lib/adb/online-install";
import { IMMORTAL_REPO, resolveLatestTag } from "@/lib/portal/provision-config";
import type { Adb } from "@yume-chan/adb";
import defaultProgram from "./program/default.program.js?raw";
import type { LoadedProvisionProgram } from "./types";
import { UPSTREAM_META } from "./upstream/snapshot";

const PROGRAM_PATH = "provisioning/openportal.program.js";
const MAX_PROGRAM_BYTES = 512_000;

/** The built-in program, kept in sync with provision.sh and always API-compatible. */
export function loadVendoredProgram(
	ref: string = UPSTREAM_META.latestReleaseTag,
): LoadedProvisionProgram {
	return { code: defaultProgram, ref, source: "vendored" };
}

function looksLikeProgram(code: string): boolean {
	return (
		code.length > 0 &&
		code.length < MAX_PROGRAM_BYTES &&
		code.includes("export") &&
		code.includes("provision")
	);
}

/**
 * Loads the provisioning program. Live path fetches it from Immortal's latest
 * release tag (device-side, CORS-free); on any failure, or while upstream has
 * not published one yet, it falls back to the vendored built-in program.
 */
export async function loadProvisionProgram(
	adb: Adb | null,
): Promise<LoadedProvisionProgram> {
	if (!adb) return loadVendoredProgram();
	const tag =
		(await resolveLatestTag(IMMORTAL_REPO)) ?? UPSTREAM_META.latestReleaseTag;
	const url = `https://raw.githubusercontent.com/${IMMORTAL_REPO}/${tag}/${PROGRAM_PATH}`;
	try {
		const code = await deviceFetchText(adb, url);
		if (!looksLikeProgram(code)) throw new Error("invalid program");
		return { code, ref: tag, source: "live" };
	} catch {
		return loadVendoredProgram(tag);
	}
}
