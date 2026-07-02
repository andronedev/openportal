import { Modal, Spinner } from "@/components/ui/primitives";
import type { CatalogApp } from "@/lib/catalog";
import {
	type ComponentType,
	type LazyExoticComponent,
	Suspense,
	lazy,
} from "react";
import { SETUP_PANELS, type SetupPanelProps } from "./registry";

const SandboxedProgramPanel = lazy(() => import("./SandboxedProgramPanel"));

/**
 * Hosts an app's setup panel inside a modal. Routes by the program kind: a
 * `panel` program loads its bespoke React panel by id from `SETUP_PANELS`; a
 * `sandboxed` program loads the generic program runner. Renders nothing when the
 * app has no panel-driven program.
 */
export function AppSetupPanel({
	app,
	open,
	onClose,
}: {
	app: CatalogApp;
	open: boolean;
	onClose: () => void;
}) {
	const program = app.program;
	let Panel: LazyExoticComponent<ComponentType<SetupPanelProps>> | undefined;
	if (program?.kind === "panel") Panel = SETUP_PANELS[program.id];
	else if (program?.kind === "sandboxed") Panel = SandboxedProgramPanel;

	return (
		<Modal open={open && !!Panel} onClose={onClose} title={app.name}>
			{Panel && (
				<Suspense
					fallback={
						<div className="flex justify-center py-6">
							<Spinner />
						</div>
					}
				>
					<Panel app={app} onClose={onClose} />
				</Suspense>
			)}
		</Modal>
	);
}
