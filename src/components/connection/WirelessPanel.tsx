import { Button, Card } from "@/components/ui/primitives";
import { enableWireless } from "@/lib/adb/wireless";
import { BRIDGE_DOWNLOAD_URL, detectBridge } from "@/lib/adb/ws-connection";
import { cn } from "@/lib/utils";
import { useDeviceStore } from "@/store/device-store";
import { useWirelessStore } from "@/store/wireless-store";
import {
	Check,
	ChevronRight,
	Download,
	Loader2,
	RefreshCw,
	Wifi,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

function formatAddress(ip: string, port: number): string {
	return `${ip}:${port}`;
}

type BridgeState = "checking" | "present" | "absent";

function useBridgeStatus(active: boolean) {
	const [status, setStatus] = useState<BridgeState>("checking");

	const recheck = useCallback(() => {
		let alive = true;
		setStatus("checking");
		detectBridge().then((info) => {
			if (alive) setStatus(info ? "present" : "absent");
		});
		return () => {
			alive = false;
		};
	}, []);

	useEffect(() => {
		if (!active) return;
		return recheck();
	}, [active, recheck]);

	return { status, recheck };
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
				<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
					<Wifi className="h-5 w-5 text-violet-400" />
				</div>
				<div className="min-w-0">
					<h2 className="font-semibold">{t("wirelessTitle")}</h2>
					<p className="mt-0.5 text-sm text-muted-foreground">
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
			<div className="rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground">
				{t("wirelessEnableNote")}
			</div>
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
	const enabled = !!lastEndpoint;
	const { status: bridge, recheck } = useBridgeStatus(enabled);
	const [open, setOpen] = useState(enabled);

	const connecting = state === "connecting" || state === "authenticating";
	const canConnect = enabled && bridge === "present";

	return (
		<details
			open={open}
			onToggle={(e) => setOpen(e.currentTarget.open)}
			className="group rounded-xl border border-border bg-background/30"
		>
			<summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
				<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
					<Wifi className="h-5 w-5 text-violet-400" />
				</div>
				<div className="min-w-0 flex-1 text-left">
					<p className="text-sm font-semibold">{t("wirelessConnectTitle")}</p>
					<p className="truncate text-xs text-muted-foreground">
						{t("wirelessConnectSubtitle")}
					</p>
				</div>
				<ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
			</summary>

			<div className="border-t border-border px-4 pb-4 pt-3">
				<GuideStep
					index={1}
					title={t("wirelessStepEnableTitle")}
					state={enabled ? "done" : "active"}
				>
					{lastEndpoint ? (
						<p className="text-xs text-muted-foreground">
							{t("wirelessStepEnableDone", {
								address: formatAddress(lastEndpoint.ip, lastEndpoint.port),
							})}
						</p>
					) : (
						<>
							<p className="text-xs text-muted-foreground">
								{t("wirelessStepEnableTodo")}
							</p>
							<details className="group/why mt-2 text-xs">
								<summary className="flex cursor-pointer list-none items-center gap-1 text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
									<ChevronRight className="h-3 w-3 shrink-0 transition-transform group-open/why:rotate-90" />
									{t("wirelessWhyUsb")}
								</summary>
								<p className="mt-1.5 pl-4 text-muted-foreground">
									{t("wirelessWhyUsbBody")}
								</p>
							</details>
						</>
					)}
				</GuideStep>

				<GuideStep
					index={2}
					title={t("wirelessStepBridgeTitle")}
					state={bridge === "present" ? "done" : enabled ? "active" : "todo"}
				>
					<p className="text-xs text-muted-foreground">
						{t("wirelessStepBridgeDesc")}
					</p>
					<BridgeStatusRow status={bridge} onRecheck={recheck} />
				</GuideStep>

				<GuideStep
					index={3}
					title={t("wirelessStepConnectTitle")}
					state={canConnect ? "active" : "todo"}
					last
				>
					<Button
						variant="primary"
						loading={connecting}
						disabled={!canConnect}
						onClick={() => {
							if (lastEndpoint) connectViaWireless(lastEndpoint);
						}}
						className="w-full"
					>
						{t("wirelessConnectAction")}
					</Button>
					{!canConnect && (
						<p className="mt-2 text-xs text-muted-foreground">
							{t("wirelessConnectBlocked")}
						</p>
					)}
				</GuideStep>
			</div>
		</details>
	);
}

function BridgeStatusRow({
	status,
	onRecheck,
}: {
	status: BridgeState;
	onRecheck: () => void;
}) {
	const { t } = useTranslation();

	return (
		<div className="mt-2 space-y-2">
			<div className="flex items-center gap-2 text-xs">
				{status === "checking" && (
					<>
						<Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
						<span className="text-muted-foreground">
							{t("wirelessBridgeChecking")}
						</span>
					</>
				)}
				{status === "present" && (
					<>
						<Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
						<span className="text-foreground">
							{t("wirelessBridgeRunning")}
						</span>
					</>
				)}
				{status === "absent" && (
					<span className="text-muted-foreground">
						{t("wirelessBridgeNotFound")}
					</span>
				)}
			</div>

			{status === "absent" && (
				<div className="space-y-2">
					<a
						href={BRIDGE_DOWNLOAD_URL}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90"
					>
						<Download className="h-3.5 w-3.5" />
						{t("wirelessBridgeDownload")}
					</a>
					<p className="text-xs text-muted-foreground">
						{t("wirelessBridgeInstalledHint")}
					</p>
				</div>
			)}

			{status !== "checking" && (
				<button
					type="button"
					onClick={onRecheck}
					className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
				>
					<RefreshCw className="h-3 w-3" />
					{t("wirelessBridgeRecheck")}
				</button>
			)}
		</div>
	);
}

function GuideStep({
	index,
	title,
	state,
	last,
	children,
}: {
	index: number;
	title: string;
	state: "done" | "active" | "todo";
	last?: boolean;
	children: ReactNode;
}) {
	return (
		<div className="flex gap-3">
			<div className="flex flex-col items-center">
				<div
					className={cn(
						"flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
						state === "done" && "bg-emerald-500/15 text-emerald-500",
						state === "active" && "bg-foreground text-background",
						state === "todo" && "bg-secondary text-muted-foreground",
					)}
				>
					{state === "done" ? <Check className="h-3.5 w-3.5" /> : index}
				</div>
				{!last && <div className="mt-1 w-px flex-1 bg-border" />}
			</div>
			<div className="min-w-0 flex-1 pb-4">
				<p
					className={cn(
						"text-sm font-medium",
						state === "todo" && "text-muted-foreground",
					)}
				>
					{title}
				</p>
				<div className="mt-1">{children}</div>
			</div>
		</div>
	);
}
