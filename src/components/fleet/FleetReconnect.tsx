import { Button } from "@/components/ui/primitives";
import { getPairedDevices } from "@/lib/adb/connection";
import { useFleetStore } from "@/store/fleet-store";
import { useWirelessEndpoints } from "@/store/wireless-store";
import { RefreshCw, Usb, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function FleetReconnect() {
	const { t } = useTranslation();
	const [paired, setPaired] = useState<
		Awaited<ReturnType<typeof getPairedDevices>>
	>([]);
	const [reconnecting, setReconnecting] = useState(false);
	const endpoints = useWirelessEndpoints();
	const connections = useFleetStore((s) => s.connections);
	const connectUsb = useFleetStore((s) => s.connectUsb);
	const connectWireless = useFleetStore((s) => s.connectWireless);
	const reconnectFleet = useFleetStore((s) => s.reconnectFleet);

	useEffect(() => {
		let cancelled = false;
		getPairedDevices()
			.then((devices) => {
				if (!cancelled) setPaired(devices);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

	const unconnectedUsb = paired.filter((d) => !connections[d.serial]);
	const unconnectedEndpoints = endpoints.filter((e) => !connections[e.serial]);

	if (unconnectedUsb.length === 0 && unconnectedEndpoints.length === 0) {
		return null;
	}

	const handleReconnectAll = async () => {
		setReconnecting(true);
		try {
			await reconnectFleet();
		} finally {
			setReconnecting(false);
		}
	};

	return (
		<div className="space-y-3 rounded-xl border border-border bg-card p-4">
			<div className="flex items-center justify-between gap-2">
				<p className="text-sm font-medium">{t("previousDevices")}</p>
				<Button
					variant="secondary"
					onClick={handleReconnectAll}
					loading={reconnecting}
				>
					<RefreshCw className="h-3.5 w-3.5" />
					{t("fleet.reconnectAll")}
				</Button>
			</div>
			<div className="space-y-1.5">
				{unconnectedUsb.map((device) => (
					<button
						key={device.serial}
						type="button"
						onClick={() => connectUsb(device)}
						className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/40"
					>
						<Usb className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						<span className="truncate">{device.name ?? device.serial}</span>
						<span className="ml-auto shrink-0 text-xs text-muted-foreground">
							{t("reconnect")}
						</span>
					</button>
				))}
				{unconnectedEndpoints.map((endpoint) => (
					<button
						key={endpoint.serial}
						type="button"
						onClick={() => connectWireless(endpoint)}
						className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/40"
					>
						<Wifi className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						<span className="truncate">{endpoint.serial}</span>
						<span className="ml-auto shrink-0 text-xs text-muted-foreground">
							{t("reconnect")}
						</span>
					</button>
				))}
			</div>
		</div>
	);
}
