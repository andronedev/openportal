import type { Adb } from "@yume-chan/adb";
import type { CatalogApp } from "../catalog";
import type { ResolvedApk } from "../sources";
import { resolveImmortal } from "./immortal";

/**
 * Bespoke per-app APK resolver, for apps whose update info isn't a standard
 * GitHub/F-Droid release. A catalog entry opts in with `source: "custom"` +
 * `customSource: "<id>"`, mirroring `setup: { kind: "custom", id }`. Adding one
 * means a catalog entry plus a resolver file in this folder.
 */
export type CustomSource = (adb: Adb, app: CatalogApp) => Promise<ResolvedApk>;

export const CUSTOM_SOURCES: Record<string, CustomSource> = {
	immortal: resolveImmortal,
};
