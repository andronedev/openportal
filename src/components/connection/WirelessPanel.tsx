import { Button, Card } from "@/components/ui/primitives";
import { enableWireless } from "@/lib/adb/wireless";
import { detectBridge } from "@/lib/adb/ws-connection";
import { useDeviceStore } from "@/store/device-store";
import { useWirelessStore } from "@/store/wireless-store";
import { Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

function formatAddress(ip: string, port: number): string {
	return `${ip}:${port}`;
}

export function WirelessSetup() {
	const { t } = useTranslation();
	const adb = useDeviceStore((s) => s.adb);
	const transport = useDeviceStore((s) => s.transport);
	const disconnect = useDeviceStore((s) => s.disconnect);
	const lastEndpoint = useWirelessStore((s) => s.lastEndpoint);
	const setEndpoint = useWirelessStore((s) => s.setEndpoint);
	const [busy, setBusy] = useState(false);

	if (!adb || transport !== "usb") return null;

	const onEnable = async () => {
		setBusy(true);
		try {
			const endpoint = await enableWireless(adb);
			if (!endpoint) {
				toast.error(t("wirelessNoIp"));
				return;
			}
			setEndpoint(endpoint);
			toast.success(
				t("wirelessEnabledAt", {
					address: formatAddress(endpoint.ip, endpoint.port),
				}),
			);
			await disconnect();
		} catch (err) {
			toast.error(t("operationFailed"), {
				description: err instanceof Error ? err.message : undefined,
			});
		} finally {
			setBusy(false);
		}
	};

	return (
		<Card className="space-y-4">
			<div className="flex items-start gap-3">
				<Wifi className="mt-0.5 h-5 w-5 shrink-0 text-violet-400" />
				<div>
					<h2 className="font-semibold">{t("wirelessTitle")}</h2>
					<p className="text-sm text-muted-foreground">
						{t("wirelessEnableHint")}
					</p>
				</div>
			</div>
			{lastEndpoint && (
				<p className="text-sm text-muted-foreground">
					{t("wirelessLastKnown", {
						address: formatAddress(lastEndpoint.ip, lastEndpoint.port),
					})}
				</p>
			)}
			<Button variant="primary" loading={busy} onClick={onEnable}>
				{busy ? t("wirelessEnabling") : t("wirelessEnable")}
			</Button>
		</Card>
	);
}

export function WirelessConnect() {
	const { t } = useTranslation();
	const state = useDeviceStore((s) => s.state);
	const connectViaWireless = useDeviceStore((s) => s.connectViaWireless);
	const lastEndpoint = useWirelessStore((s) => s.lastEndpoint);
	const [bridge, setBridge] = useState<"unknown" | "present" | "absent">(
		"unknown",
	);

	useEffect(() => {
		if (!lastEndpoint) return;
		let alive = true;
		detectBridge().then((info) => {
			if (alive) setBridge(info ? "present" : "absent");
		});
		return () => {
			alive = false;
		};
	}, [lastEndpoint]);

	if (!lastEndpoint) return null;

	const connecting = state === "connecting" || state === "authenticating";

	return (
		<div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Wifi className="h-4 w-4 text-violet-400" />
				<span>
					{t("wirelessLastKnown", {
						address: formatAddress(lastEndpoint.ip, lastEndpoint.port),
					})}
				</span>
			</div>
			{bridge === "present" && (
				<Button
					variant="secondary"
					loading={connecting}
					onClick={() => connectViaWireless(lastEndpoint)}
					className="w-full"
				>
					{t("wirelessReconnect")}
				</Button>
			)}
			{bridge === "absent" && (
				<p className="text-xs text-muted-foreground">
					{t("wirelessBridgeNeeded")}
				</p>
			)}
		</div>
	);
}
