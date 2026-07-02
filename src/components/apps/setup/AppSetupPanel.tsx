import { Modal, Spinner } from "@/components/ui/primitives";
import type { CatalogApp } from "@/lib/catalog";
import { Suspense, lazy } from "react";

const SandboxedProgramPanel = lazy(() => import("./SandboxedProgramPanel"));

/**
 * Hosts an app's setup inside a modal. Every app that needs a setup UI declares
 * a `sandboxed` program, so this renders the one generic program runner; it
 * renders nothing for apps with no (or a declarative `commands`) program.
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
	const isSandboxed = app.program?.kind === "sandboxed";

	return (
		<Modal open={open && isSandboxed} onClose={onClose} title={app.name}>
			{isSandboxed && (
				<Suspense
					fallback={
						<div className="flex justify-center py-6">
							<Spinner />
						</div>
					}
				>
					<SandboxedProgramPanel app={app} onClose={onClose} />
				</Suspense>
			)}
		</Modal>
	);
}
