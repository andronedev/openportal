export type CatalogCategory =
	| "launcher"
	| "store"
	| "media"
	| "photo"
	| "smartHome"
	| "assistant"
	| "utility";

export type AppSource = "github" | "fdroid" | "url" | "morphe" | "external";

/**
 * How much OpenPortal trusts an app's remote-fetched program. Only these tiers
 * may fetch and run a `sandboxed` program live; unknown contributors cannot ship
 * one. `first-party` is OpenPortal's own; `verified` is a vetted partner (e.g. a
 * launcher author) whose release we fetch at run time.
 */
export type ProgramTrust = "first-party" | "verified";

/**
 * An app's lifecycle program: everything beyond a plain install. Every app is
 * data-only by default (no program); apps that need post-install work declare
 * one of two flavors, all under this single field:
 *
 * - `commands`: declarative shell commands. `auto: true` runs them silently
 *   right after install (e.g. a launcher that becomes default); otherwise they
 *   run when the user clicks the setup gear.
 * - `sandboxed`: a JavaScript program run in a sandboxed worker via the `portal`
 *   capability API (see `src/lib/programs`). It declares its own UI (a manifest
 *   form, presentation, a result view), so setup that needs configuration is
 *   data, not code. First-party programs are bundled in the app's own folder; a
 *   partner ships one in their repo. Gated by `trust`.
 */
export type AppProgram =
	| { kind: "commands"; commands: string[]; auto?: boolean; labelKey?: string }
	| {
			kind: "sandboxed";
			/**
			 * `owner/repo` that publishes the program module + its `config.env`.
			 * Omit it for a first-party program bundled in the app's own folder
			 * (`catalog/apps/<id>/program.js`), which OpenPortal loads directly.
			 */
			repo?: string;
			/**
			 * Path to the program ES module in the repo. Defaults to
			 * `provisioning/openportal.program.js`.
			 */
			programPath?: string;
			/** Only `verified`/`first-party` programs are fetched live and run. */
			trust: ProgramTrust;
			labelKey?: string;
			handlesInstall?: boolean;
			revertOnUninstall?: boolean;
	  };

export interface CatalogApp {
	id: string;
	name: string;
	packageName: string;
	description: string;
	category: CatalogCategory;
	version: string;
	/**
	 * Restrict the app to Advanced mode. When `true`, the catalog only lists it
	 * while the UI is in Advanced mode; by default (absent/`false`) it shows in
	 * Classic mode too.
	 */
	advancedOnly?: boolean;
	/**
	 * App built specifically for the Portal. Highlighted in a dedicated "Made for
	 * Portal" section at the top of the catalog and with a badge on its card.
	 */
	madeForPortal?: boolean;
	/**
	 * Where the APK comes from. `github`/`fdroid`/`url`/`morphe` can be installed
	 * automatically (the device downloads them); `external` only opens a page.
	 * `morphe` resolves a signed remote manifest (modded builds) and verifies the
	 * APK hash on-device before install. Apps whose install is driven by a
	 * `program` (e.g. a launcher) need no `source`.
	 */
	source?: AppSource;
	/**
	 * `owner/repo` on GitHub. Required for `source: "github"` (the APK is
	 * resolved from its releases). For any other source it is optional and only
	 * used to render the project's README on the app's detail page — set it to a
	 * GitHub mirror to give an F-Droid/URL app a rich description.
	 */
	repo?: string;
	/**
	 * For `source: "github"` only: a case-insensitive regular expression matched
	 * against release asset file names to pick the right APK when a release ships
	 * several variants (per-ABI splits, signed vs unsigned flavors, TV builds…).
	 * The first matching asset wins. Without it, the resolver falls back to the
	 * first `.apk` asset, which is wrong when that happens to be an unsigned or
	 * off-target build. If set and nothing matches, install fails loudly rather
	 * than installing the wrong APK.
	 */
	assetPattern?: string;
	/** Direct APK URL for `source: "url"`. */
	apkUrl?: string;
	downloadUrl?: string;
	/** Optional remote icon URL; falls back to an initials avatar when absent. */
	iconUrl?: string;
	/**
	 * Bundled icon under `public/app-icons/`, for apps with no hosted image to
	 * link. `true` resolves to `app-icons/<packageName>.png`; a string is the
	 * file extension (e.g. `"svg"`). `iconUrl` wins when both are set.
	 */
	iconFile?: boolean | string;
	/** Optional lifecycle program (see {@link AppProgram}). */
	program?: AppProgram;
	/**
	 * Skip the "update available" check for this app. Set it when upstream
	 * versioning is unreliable (e.g. release tags that don't match the APK's
	 * embedded versionName), which would otherwise surface a phantom update.
	 */
	skipUpdateCheck?: boolean;
	requires?: string[];
}

/**
 * A program whose setup runs through the modal program panel (`sandboxed`). It
 * can install the app itself (`handlesInstall`) and revert on uninstall
 * (`revertOnUninstall`), as opposed to declarative `commands`.
 */
export type PanelProgram = Extract<AppProgram, { kind: "sandboxed" }>;

export function isPanelProgram(
	program: AppProgram | undefined,
): program is PanelProgram {
	return program?.kind === "sandboxed";
}
