import rawCatalog from "./catalog.json";

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
 * Post-install configuration for an app.
 *
 * - `commands`: declarative shell commands run to finish setup. Set `auto: true`
 *   to run them silently right after install (e.g. a launcher that becomes the
 *   default); otherwise they run when the user clicks the setup gear.
 * - `custom`: setup needs a UI (e.g. uploading credentials). `id` maps to a
 *   panel registered in `src/components/apps/setup/registry.ts`. This is the one
 *   case where a catalog entry also needs a matching code change.
 */
export type AppSetup =
	| { kind: "commands"; commands: string[]; auto?: boolean; labelKey?: string }
	| { kind: "custom"; id: string; labelKey?: string };

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
	 * APK hash on-device before install.
	 */
	source?: AppSource;
	/**
	 * `owner/repo` on GitHub. Required for `source: "github"` (the APK is
	 * resolved from its releases). For any other source it is optional and only
	 * used to render the project's README on the app's detail page — set it to a
	 * GitHub mirror to give an F-Droid/URL app a rich description.
	 */
	repo?: string;
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
	/** Optional post-install configuration (see {@link AppSetup}). */
	setup?: AppSetup;
	/**
	 * Skip the "update available" check for this app. Set it when upstream
	 * versioning is unreliable (e.g. release tags that don't match the APK's
	 * embedded versionName), which would otherwise surface a phantom update.
	 */
	skipUpdateCheck?: boolean;
	requires?: string[];
}

// The catalog is data-only and lives in catalog.json so the community can submit
// new apps via simple PRs. See CONTRIBUTING.md for the submission format.
export const APP_CATALOG: CatalogApp[] = rawCatalog as CatalogApp[];

export function getCatalogByCategory(): Map<string, CatalogApp[]> {
	const map = new Map<string, CatalogApp[]>();
	for (const app of APP_CATALOG) {
		const existing = map.get(app.category) ?? [];
		existing.push(app);
		map.set(app.category, existing);
	}
	return map;
}

const BY_PACKAGE = new Map(APP_CATALOG.map((app) => [app.packageName, app]));

/** Looks up a catalog entry by its Android package name, if any. */
export function getCatalogApp(packageName: string): CatalogApp | undefined {
	return BY_PACKAGE.get(packageName);
}

/** Resolves the icon source for an app: remote `iconUrl`, else a bundled file. */
export function getAppIconUrl(app: CatalogApp): string | undefined {
	if (app.iconUrl) return app.iconUrl;
	if (app.iconFile) {
		const ext = typeof app.iconFile === "string" ? app.iconFile : "png";
		return `${import.meta.env.BASE_URL}app-icons/${app.packageName}.${ext}`;
	}
	return undefined;
}

/** Canonical, shareable deep-link to an app's catalog entry, keyed by package. */
export function getAppShareUrl(packageName: string): string {
	return `${window.location.origin}${import.meta.env.BASE_URL}apps/${packageName}`;
}
