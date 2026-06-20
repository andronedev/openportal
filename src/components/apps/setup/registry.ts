import type { CatalogApp } from "@/lib/portal/catalog";
import { type ComponentType, type LazyExoticComponent, lazy } from "react";

export interface SetupPanelProps {
	app: CatalogApp;
	onClose: () => void;
}

/**
 * Maps a `setup: { kind: "custom", id }` catalog entry to the React panel that
 * drives its configuration. Panels are code-split so their (sometimes heavy) UI
 * only loads when a user opens the setup gear. Adding a custom-setup app means
 * adding both a catalog entry and an entry here.
 */
export const SETUP_PANELS: Record<
	string,
	LazyExoticComponent<ComponentType<SetupPanelProps>>
> = {
	gphotos: lazy(() => import("./GPhotosSetup")),
	"portal-calendar": lazy(() => import("./PortalCalendarSetup")),
	"immortal-provision": lazy(() => import("./ImmortalProvisioning")),
};
