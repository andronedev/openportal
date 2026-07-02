import { Button, Modal } from "@/components/ui/primitives";
import type { CatalogApp } from "@/lib/portal/catalog";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CommandList } from "./SetupNotice";

export function SetupConfirmDialog({
	app,
	open,
	onClose,
	onConfirm,
	onInstallOnly,
}: {
	app: CatalogApp;
	open: boolean;
	onClose: () => void;
	onConfirm: () => void;
	onInstallOnly: () => void;
}) {
	const { t } = useTranslation("apps");
	const { t: tc } = useTranslation();
	const [runSetup, setRunSetup] = useState(true);

	useEffect(() => {
		if (open) setRunSetup(true);
	}, [open]);

	const program = app.program;
	if (program?.kind !== "commands") return null;

	return (
		<Modal
			open={open}
			onClose={onClose}
			title={t("setupConfirmTitle", { name: app.name })}
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						{tc("cancel")}
					</Button>
					<Button
						variant="primary"
						onClick={() => {
							(runSetup ? onConfirm : onInstallOnly)();
							onClose();
						}}
					>
						{t(runSetup ? "installAndConfigure" : "install")}
					</Button>
				</>
			}
		>
			<div className="space-y-3">
				<p className="text-muted-foreground">
					{t("setupConfirmIntro", { name: app.name })}
				</p>
				<div className="max-h-64 overflow-auto">
					<CommandList commands={program.commands} />
				</div>
				<label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-background/50 px-3 py-2.5">
					<input
						type="checkbox"
						checked={runSetup}
						onChange={(e) => setRunSetup(e.target.checked)}
						className="mt-0.5 h-4 w-4 shrink-0 accent-sky-500"
					/>
					<span className="flex flex-col gap-0.5">
						<span className="font-medium">{t("setupConfirmRunCommands")}</span>
						<span className="text-xs text-muted-foreground">
							{t("setupConfirmHint")}
						</span>
					</span>
				</label>
			</div>
		</Modal>
	);
}
