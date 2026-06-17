import { EmptyState, Segmented } from "@/components/ui/primitives";
import {
	APP_CATALOG,
	type CatalogApp,
	getCatalogByCategory,
} from "@/lib/portal/catalog";
import { useUIStore } from "@/store/ui-store";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppCard } from "./AppCard";

const CATEGORY_ORDER = [
	"launcher",
	"store",
	"photo",
	"media",
	"smartHome",
	"assistant",
	"utility",
] as const;

export function AppCatalog() {
	const { t } = useTranslation("apps");
	const mode = useUIStore((s) => s.mode);
	const [search, setSearch] = useState("");
	const [category, setCategory] = useState<string>("all");

	const catalog = useMemo(() => getCatalogByCategory(), []);

	// Categories with at least one app visible for the current mode (classic
	// hides apps flagged advancedOnly), in the canonical order.
	const visibleByCategory = useMemo(() => {
		const map = new Map<string, CatalogApp[]>();
		for (const cat of CATEGORY_ORDER) {
			const apps = catalog.get(cat);
			if (!apps?.length) continue;
			const visible =
				mode === "classic" ? apps.filter((a) => !a.advancedOnly) : apps;
			if (visible.length) map.set(cat, visible);
		}
		return map;
	}, [catalog, mode]);

	const portalApps = useMemo(
		() =>
			APP_CATALOG.filter(
				(a) => a.madeForPortal && (mode === "advanced" || !a.advancedOnly),
			),
		[mode],
	);

	const moddedApps = useMemo(
		() =>
			APP_CATALOG.filter(
				(a) =>
					a.source === "morphe" && (mode === "advanced" || !a.advancedOnly),
			),
		[mode],
	);

	const query = search.trim().toLowerCase();
	const matches = (app: CatalogApp) =>
		!query ||
		app.name.toLowerCase().includes(query) ||
		app.description.toLowerCase().includes(query) ||
		app.packageName.toLowerCase().includes(query);

	const categoryOptions = [
		{ value: "all", label: t("allCategories") },
		...[...visibleByCategory.keys()].map((cat) => ({
			value: cat,
			label: t(`category.${cat}`),
		})),
	];

	const activeCats =
		category === "all"
			? [...visibleByCategory.keys()]
			: visibleByCategory.has(category)
				? [category]
				: [];

	const showPortalSection =
		category === "all" && !query && portalApps.length > 0;
	const portalIds = new Set(portalApps.map((a) => a.id));

	const showModdedSection =
		category === "all" && !query && moddedApps.length > 0;
	const moddedIds = new Set(moddedApps.map((a) => a.id));

	const sections = activeCats
		.map((cat) => ({
			cat,
			apps: (visibleByCategory.get(cat) ?? [])
				.filter((a) => !(showPortalSection && portalIds.has(a.id)))
				.filter((a) => !(showModdedSection && moddedIds.has(a.id)))
				.filter(matches),
		}))
		.filter((section) => section.apps.length > 0);

	const totalMatches = sections.reduce((n, s) => n + s.apps.length, 0);
	const hasContent = showPortalSection || showModdedSection || totalMatches > 0;

	return (
		<div className="space-y-3">
			<div className="relative w-full sm:w-72">
				<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder={t("searchApps")}
					aria-label={t("searchApps")}
					className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</div>
			<div className="-mx-1 overflow-x-auto px-1 pb-1">
				<Segmented
					value={category}
					onChange={setCategory}
					options={categoryOptions}
					size="sm"
				/>
			</div>

			{!hasContent ? (
				<EmptyState title={t("noResults")} />
			) : (
				<div className="space-y-6">
					{showPortalSection && (
						<div>
							<h4 className="mb-3 text-sm font-medium text-muted-foreground">
								{t("madeForPortal")}
							</h4>
							<div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
								{portalApps.map((app) => (
									<AppCard key={app.id} app={app} />
								))}
							</div>
						</div>
					)}
					{showModdedSection && (
						<div>
							<h4 className="mb-3 text-sm font-medium text-muted-foreground">
								{t("moddedForPortal")}
							</h4>
							<div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
								{moddedApps.map((app) => (
									<AppCard key={app.id} app={app} />
								))}
							</div>
						</div>
					)}
					{sections.map(({ cat, apps }) => (
						<div key={cat}>
							{category === "all" && (
								<h4 className="mb-3 text-sm font-medium text-muted-foreground">
									{t(`category.${cat}`)}
								</h4>
							)}
							<div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
								{apps.map((app) => (
									<AppCard key={app.id} app={app} />
								))}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
