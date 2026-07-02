import { ConnectPanel } from "@/components/connection/ConnectPanel";
import { WirelessSetup } from "@/components/connection/WirelessPanel";
import { DeviceCard } from "@/components/dashboard/DeviceCard";
import { DeviceHero } from "@/components/dashboard/DeviceHero";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { SetupGuide } from "@/components/dashboard/SetupGuide";
import { StorageBar } from "@/components/dashboard/StorageBar";
import { ScreenMirror } from "@/components/screen/ScreenMirror";
import { useAppStore } from "@/store/app-store";
import { useDeviceStore } from "@/store/device-store";
import { useUIStore } from "@/store/ui-store";
import { MonitorSmartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function DashboardPage() {
	const { t } = useTranslation("dashboard");
	const state = useDeviceStore((s) => s.state);
	const adb = useDeviceStore((s) => s.adb);
	const mode = useUIStore((s) => s.mode);
	const refreshInstalled = useAppStore((s) => s.refreshInstalled);
	const [showScreen, setShowScreen] = useState(false);
	const connected = state === "connected";

	useEffect(() => {
		refreshInstalled();
	}, [refreshInstalled]);

	const screenBlock =
		adb &&
		(showScreen ? (
			<ScreenMirror autoStart onClose={() => setShowScreen(false)} />
		) : (
			<button
				type="button"
				onClick={() => setShowScreen(true)}
				className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
			>
				<MonitorSmartphone className="h-4 w-4" />
				{t("showScreen")}
			</button>
		));

	if (!connected) {
		return (
			<div className="mx-auto max-w-md space-y-6">
				<ConnectPanel />
			</div>
		);
	}

	// Classic: a welcoming, action-first page for newcomers. Storage lives in the
	// hero, the snapshot is the doorway to the Screen page, and the technical
	// spec sheet and status flags only show up in Advanced mode.
	if (mode === "classic") {
		return (
			<div className="mx-auto max-w-4xl space-y-6">
				<DeviceHero />
				<SetupGuide />
				<WirelessSetup />
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-4xl space-y-6">
			<h1 className="text-2xl font-bold">{t("title")}</h1>
			{screenBlock}
			<DeviceCard />
			<StorageBar />
			<QuickActions />
			<WirelessSetup />
		</div>
	);
}
