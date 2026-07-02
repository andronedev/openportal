import type { CatalogApp } from "@/lib/portal/catalog";
import { type ComponentType, type LazyExoticComponent, lazy } from "react";

export interface SetupPanelProps {
	app: CatalogApp;
	onClose: () => void;
}

/**
 * Maps a `program: { kind: "panel", id }` catalog entry to the React panel that
 * drives its configuration. Panels are code-split so their (sometimes heavy) UI
 * only loads when a user opens the setup gear. Adding a panel-program app means
 * adding both a catalog entry and an entry here. Sandboxed programs
 * (`kind: "sandboxed"`) are not listed here: they all share one generic runner,
 * `SandboxedProgramPanel`, routed by kind in `AppSetupPanel`.
 */
export const SETUP_PANELS: Record<
	string,
	LazyExoticComponent<ComponentType<SetupPanelProps>>
> = {
	gphotos: lazy(() => import("./GPhotosSetup")),
	"portal-calendar": lazy(() => import("./PortalCalendarSetup")),
};
