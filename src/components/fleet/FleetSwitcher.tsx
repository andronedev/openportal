import { ConfirmDialog } from "@/components/ui/primitives";
import {
	type DeviceConnection,
	useActiveSerial,
	useBusySerials,
	useFleetConnections,
	useFleetStore,
	useSelectedSerials,
} from "@/store/fleet-store";
import { Check, Loader2, Usb, Wifi, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AddDeviceMenu } from "./AddDeviceMenu";

function deviceLabel(connection: DeviceConnection): string {
	return (
		connection.portalModel?.displayName ??
		connection.deviceInfo?.model ??
		connection.name ??
		connection.serial
	);
}

export function FleetSwitcher({ onNavigate }: { onNavigate?: () => void }) {
	const { t } = useTranslation();
	const connections = useFleetConnections();
	const activeSerial = useActiveSerial();
	const selected = useSelectedSerials();
	const busySerials = useBusySerials();
	const setActive = useFleetStore((s) => s.setActive);
	const disconnect = useFleetStore((s) => s.disconnect);
	const toggleSelected = useFleetStore((s) => s.toggleSelected);
	const [confirmSerial, setConfirmSerial] = useState<string | null>(null);

	if (connections.length === 0) return null;

	const showCheckboxes = connections.length > 1;
	const confirmTarget = connections.find((c) => c.serial === confirmSerial);

	return (
		<div className="space-y-0.5 border-b border-border px-3 py-2">
			<div className="flex items-center justify-between px-1 pb-1">
				<p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
					{t("fleet.deviceCount", { count: connections.length })}
				</p>
				<AddDeviceMenu />
			</div>
			{connections.map((connection) => {
				const isActive = connection.serial === activeSerial;
				const isBusy = !!busySerials[connection.serial];
				const label = deviceLabel(connection);

				return (
					<div
						key={connection.serial}
						className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
							isActive
								? "bg-accent font-medium text-accent-foreground"
								: "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
						}`}
					>
						{showCheckboxes && (
							<input
								type="checkbox"
								checked={!!selected[connection.serial]}
								onChange={() => toggleSelected(connection.serial)}
								aria-label={t("fleet.selectDevice", { name: label })}
								className="h-3.5 w-3.5 shrink-0 accent-foreground"
							/>
						)}
						<button
							type="button"
							onClick={() => {
								setActive(connection.serial);
								onNavigate?.();
							}}
							title={
								isActive
									? t("fleet.active")
									: t("fleet.switchTo", { name: label })
							}
							className="flex min-w-0 flex-1 items-center gap-2 text-left"
						>
							{connection.kind === "wireless" ? (
								<Wifi className="h-3.5 w-3.5 shrink-0" />
							) : (
								<Usb className="h-3.5 w-3.5 shrink-0" />
							)}
							<span className="truncate">{label}</span>
							{isBusy && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
							{isActive && !isBusy && (
								<Check className="h-3.5 w-3.5 shrink-0" />
							)}
						</button>
						<button
							type="button"
							onClick={() => setConfirmSerial(connection.serial)}
							title={t("fleet.disconnectOne", { name: label })}
							aria-label={t("fleet.disconnectOne", { name: label })}
							className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
						>
							<X className="h-3.5 w-3.5" />
						</button>
					</div>
				);
			})}

			{confirmTarget && (
				<ConfirmDialog
					open
					onClose={() => setConfirmSerial(null)}
					onConfirm={() => disconnect(confirmTarget.serial)}
					title={t("disconnectConfirmTitle")}
					message={t("disconnectConfirmMessage")}
					confirmLabel={t("disconnect")}
					danger
				/>
			)}
		</div>
	);
}
