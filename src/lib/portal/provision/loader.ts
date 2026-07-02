import { deviceFetchText } from "@/lib/adb/online-install";
import type { ProgramTrust } from "@/lib/portal/catalog";
import { resolveLatestTag } from "@/lib/portal/provision-config";
import type { Adb } from "@yume-chan/adb";
import defaultProgram from "./program/default.program.js?raw";
import type { LoadedProvisionProgram } from "./types";
import { UPSTREAM_META } from "./upstream/snapshot";

const DEFAULT_PROGRAM_PATH = "provisioning/openportal.program.js";
const MAX_PROGRAM_BYTES = 512_000;

/**
 * Which program to load and how much we trust its source. `repo`/`programPath`
 * come from the catalog entry (`program.kind === "sandboxed"`); only `verified`
 * or `first-party` programs are ever fetched and executed.
 */
export interface ProgramSpec {
	repo: string;
	programPath?: string;
	trust: ProgramTrust;
}

/** We ship a vendored offline snapshot only for this repo's program. */
function hasVendoredSnapshot(repo: string): boolean {
	return repo === UPSTREAM_META.repo;
}

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
 * Loads a sandboxed provisioning program. Live path fetches it from the
 * partner's latest release tag (device-side, CORS-free). Only trusted programs
 * run; on any failure, or with no device, it falls back to the vendored built-in
 * program when we ship one for that repo, otherwise it throws.
 */
export async function loadProgram(
	adb: Adb | null,
	spec: ProgramSpec,
): Promise<LoadedProvisionProgram> {
	const trusted = spec.trust === "verified" || spec.trust === "first-party";
	if (!adb || !trusted) {
		if (hasVendoredSnapshot(spec.repo)) return loadVendoredProgram();
		throw new Error("No provisioning program is available for this app");
	}
	const path = spec.programPath ?? DEFAULT_PROGRAM_PATH;
	const tag =
		(await resolveLatestTag(spec.repo)) ?? UPSTREAM_META.latestReleaseTag;
	const url = `https://raw.githubusercontent.com/${spec.repo}/${tag}/${path}`;
	try {
		const code = await deviceFetchText(adb, url);
		if (!looksLikeProgram(code)) throw new Error("invalid program");
		return { code, ref: tag, source: "live" };
	} catch {
		if (hasVendoredSnapshot(spec.repo)) return loadVendoredProgram(tag);
		throw new Error("Could not load the provisioning program");
	}
}
