import { deviceFetchText } from "@/lib/adb/online-install";
import type { ProgramTrust } from "@/lib/catalog";
import { resolveLatestTag } from "@/lib/programs/config";
import type { Adb } from "@yume-chan/adb";
import { UPSTREAM_META } from "../../../catalog/apps/immortal-launcher/upstream/snapshot";
import type { LoadedProgram } from "./types";

const DEFAULT_PROGRAM_PATH = "provisioning/openportal.program.js";
const MAX_PROGRAM_BYTES = 512_000;
const IMMORTAL_APP_ID = "immortal-launcher";

/**
 * Programs bundled in each app's own catalog folder, discovered at build time and
 * keyed by app id. This is how first-party programs (Morphe aside, which runs
 * headlessly) ship, and the offline fallback for partner programs we vendor.
 */
const bundledPrograms = import.meta.glob<string>("/catalog/apps/*/program.js", {
	query: "?raw",
	import: "default",
	eager: true,
});

function bundledCode(appId: string): string | undefined {
	return bundledPrograms[`/catalog/apps/${appId}/program.js`];
}

/**
 * Which program to load and how much we trust its source. `repo`/`programPath`
 * come from the catalog entry (`program.kind === "sandboxed"`); only `verified`
 * or `first-party` programs are ever fetched and executed. A repo-less spec is a
 * first-party program bundled in the app's own folder.
 */
export interface ProgramSpec {
	repo?: string;
	programPath?: string;
	trust: ProgramTrust;
}

/** We ship a vendored offline snapshot only for this repo's program. */
function hasVendoredSnapshot(repo: string): boolean {
	return repo === UPSTREAM_META.repo;
}

/** The built-in Immortal program, kept in sync with provision.sh and API-compatible. */
export function loadVendoredProgram(
	ref: string = UPSTREAM_META.latestReleaseTag,
): LoadedProgram {
	const code = bundledCode(IMMORTAL_APP_ID);
	if (!code) throw new Error("The built-in Immortal program is missing");
	return { code, ref, source: "vendored" };
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
	appId: string,
): Promise<LoadedProgram> {
	// First-party program bundled in the app's own folder (no partner repo).
	if (!spec.repo) {
		const code = bundledCode(appId);
		if (!code) throw new Error("No program is bundled for this app");
		return { code, ref: "bundled", source: "vendored" };
	}
	// A partner repo: fetch the program live, with the vendored snapshot as the
	// offline/failure fallback for the one repo we ship one for (Immortal).
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
