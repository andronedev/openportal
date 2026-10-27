import { Button, ConfirmDialog } from "@/components/ui/primitives";
import {
	type ControlCenterState,
	getControlCenterState,
	setControlCenterEnabled,
} from "@/lib/adb/control-center";
import { cn } from "@/lib/utils";
import { useDeviceStore } from "@/store/device-store";
import { Video } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function ControlCenterCard() {
	const { t } = useTranslation("dashboard");
	const adb = useDeviceStore((s) => s.adb);
	const reboot = useDeviceStore((s) => s.reboot);
	const [state, setState] = useState<ControlCenterState | null>(null);
	const [confirming, setConfirming] = useState(false);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (!adb) return;
		let cancelled = false;
		getControlCenterState(adb).then(
			(next) => {
				if (!cancelled) setState(next);
			},
			() => {
				if (!cancelled) setState("unavailable");
			},
		);
		return () => {
			cancelled = true;
		};
	}, [adb]);

	if (!adb || state === null || state === "unavailable") return null;

	const enabled = state === "enabled";

	const apply = async () => {
		setBusy(true);
		try {
			await setControlCenterEnabled(adb, !enabled);
			toast.success(t("controlCenter.restarting"));
			await reboot();
		} catch (err) {
			toast.error(t("controlCenter.failed"), {
				description: err instanceof Error ? err.message : undefined,
			});
			setBusy(false);
		}
	};

	return (
		<div className="rounded-xl border border-border bg-card p-6">
			<div className="mb-3 flex items-center gap-2">
				<Video className="h-4 w-4 text-muted-foreground" />
				<h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
					{t("controlCenter.title")}
				</h3>
			</div>
			<p className="text-sm text-muted-foreground">
				{t("controlCenter.description")}
			</p>
			<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
				<span className="inline-flex items-center gap-2 text-sm">
					<span
						aria-hidden="true"
						className={cn(
							"h-2 w-2 rounded-full",
							enabled ? "bg-amber-500" : "bg-emerald-500",
						)}
					/>
					{enabled ? t("controlCenter.on") : t("controlCenter.off")}
				</span>
				<Button
					variant={enabled ? "danger" : "secondary"}
					loading={busy}
					onClick={() => setConfirming(true)}
				>
					{enabled ? t("controlCenter.turnOff") : t("controlCenter.turnOn")}
				</Button>
			</div>
			<ConfirmDialog
				open={confirming}
				onClose={() => setConfirming(false)}
				onConfirm={apply}
				title={
					enabled
						? t("controlCenter.confirmOffTitle")
						: t("controlCenter.confirmOnTitle")
				}
				message={
					enabled ? t("controlCenter.confirmOff") : t("controlCenter.confirmOn")
				}
				confirmLabel={t("controlCenter.restart")}
				danger={enabled}
			/>
		</div>
	);
}
