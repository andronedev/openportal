import catalogIndex from "../../../catalog/index.json";
import type { CatalogApp } from "./types";

export * from "./types";

// The catalog is data-only and lives at the repo root in `catalog/`: one folder
// per app under `catalog/apps/<id>/app.json`, discovered here at build time. The
// community submits an app with a PR that adds one folder, no code change. See
// catalog/README.md and CONTRIBUTING.md for the format.
const appModules = import.meta.glob<{ default: CatalogApp }>(
	"/catalog/apps/*/app.json",
	{ eager: true },
);

// `catalog/index.json` curates the list: `order` fixes the display order (the
// folder glob is unordered) and `featured` pins the "Made for Portal" section.
function loadCatalog(): CatalogApp[] {
	const featured = new Set<string>(catalogIndex.featured);
	const rank = new Map(catalogIndex.order.map((id, i) => [id, i]));
	return Object.values(appModules)
		.map((mod) =>
			featured.has(mod.default.id)
				? { ...mod.default, madeForPortal: true }
				: mod.default,
		)
		.sort(
			(a, b) =>
				(rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
				(rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
		);
}

export const APP_CATALOG: CatalogApp[] = loadCatalog();

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
