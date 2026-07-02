import rawCatalog from "./catalog.json";
import type { CatalogApp } from "./types";

export * from "./types";

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
