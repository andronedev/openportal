import { LogoMark, LogoWordmark } from "@/components/ui/Logo";
import { Card } from "@/components/ui/primitives";
import { getPlatformSupport } from "@/lib/utils/platform";
import { useDeviceStore } from "@/store/device-store";
import { ArrowRight, Usb } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrowserCheck } from "./BrowserCheck";
import { WirelessConnect } from "./WirelessPanel";

export function ConnectPanel() {
	const { t } = useTranslation();
	const { state, error, connect } = useDeviceStore();
	const support = getPlatformSupport();

	const isConnecting = state === "connecting" || state === "authenticating";

	return (
		<Card className="space-y-8">
			<div className="text-center">
				<div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10">
					<LogoMark className="h-9 w-9" />
				</div>
				<h1 className="text-3xl font-bold tracking-tight">
					<LogoWordmark />
				</h1>
				<p className="mt-2 text-muted-foreground">{t("connectDescription")}</p>
			</div>

			<BrowserCheck />

			<button
				type="button"
				onClick={() => connect()}
				disabled={!support.supported || isConnecting}
				className="flex w-full items-center justify-center gap-3 rounded-xl bg-foreground px-6 py-4 text-lg font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
			>
				{isConnecting ? (
					<div className="h-5 w-5 animate-spin rounded-full border-2 border-background border-t-transparent" />
				) : (
					<Usb className="h-5 w-5" />
				)}
				{isConnecting ? t("connecting") : t("connectYourPortal")}
			</button>
			{error && (
				<div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
					<p>{error}</p>
					{error.toLowerCase().includes("already") && (
						<p className="mt-1 text-red-300">
							{t("adbAlreadyRunningHint")}{" "}
							<code className="rounded bg-red-500/20 px-1 font-mono">
								adb kill-server
							</code>
						</p>
					)}
				</div>
			)}

			<div className="space-y-3">
				<Step number={1} text={t("step1")} />
				<Step number={2} text={t("step2")} />
				<Step number={3} text={t("step3")} />
			</div>

			<WirelessConnect />
		</Card>
	);
}

function Step({ number, text }: { number: number; text: string }) {
	return (
		<div className="flex items-center gap-3 text-sm text-muted-foreground">
			<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-foreground">
				{number}
			</div>
			<span>{text}</span>
			<ArrowRight className="ml-auto h-3 w-3 opacity-30" />
		</div>
	);
}
