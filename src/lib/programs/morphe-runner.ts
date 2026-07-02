import { MORPHE_MANIFEST_URLS } from "@/lib/catalog/morphe";
import type { Adb } from "@yume-chan/adb";
import morpheProgramCode from "../../../catalog/programs/morphe/program.js?raw";
import { provision } from "./broker";
import { parseConfigEnv } from "./config";
import type { LoadedProgram, OnStep } from "./types";

const MORPHE_PROGRAM: LoadedProgram = {
	code: morpheProgramCode,
	ref: "bundled",
	source: "vendored",
};

/**
 * Installs a Morphe (modded) app by running the first-party Morphe program in
 * the sandboxed worker. The program fetches the signed manifest, verifies it
 * through the native `verifyMorpheManifest` capability (the pinned key stays on
 * the host), picks the arch-matched build, and installs it. The manifest URLs
 * are host config, passed in as answers; the program carries no secrets.
 */
export async function installMorpheApp(
	adb: Adb,
	packageName: string,
	onStep: OnStep = () => {},
): Promise<void> {
	await provision(
		adb,
		parseConfigEnv(""),
		{ packageName, manifestUrls: MORPHE_MANIFEST_URLS.join("\n") },
		onStep,
		{ program: MORPHE_PROGRAM },
	);
}
