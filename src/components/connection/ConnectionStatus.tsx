import {
	useActivePortalModel,
	useActiveState,
	useFleetConnections,
} from "@/store/fleet-store";
import { useTranslation } from "react-i18next";

export function ConnectionStatus() {
	const { t } = useTranslation();
	const state = useActiveState();
	const portalModel = useActivePortalModel();
	const connections = useFleetConnections();

	const statusConfig = {
		disconnected: { color: "bg-zinc-500", label: t("disconnected") },
		connecting: { color: "bg-amber-500 animate-pulse", label: t("connecting") },
		authenticating: {
			color: "bg-amber-500 animate-pulse",
			label: t("connecting"),
		},
		connected: {
			color: "bg-emerald-500",
			label: portalModel?.displayName ?? t("connected"),
		},
		error: { color: "bg-red-500", label: t("error") },
	};

	const config = statusConfig[state];

	return (
		<div className="flex items-center gap-2">
			<div className={`h-2 w-2 rounded-full ${config.color}`} />
			<span className="text-sm text-muted-foreground">{config.label}</span>
			{connections.length > 1 && (
				<span className="rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
					{t("fleet.deviceCount", { count: connections.length })}
				</span>
			)}
		</div>
	);
}
