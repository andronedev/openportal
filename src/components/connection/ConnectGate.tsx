import { EmptyState } from "@/components/ui/primitives";
import { useActiveState } from "@/store/fleet-store";
import { Usb } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConnectButton } from "./ConnectButton";

export function ConnectGate({ children }: { children: React.ReactNode }) {
	const state = useActiveState();

	if (state === "connected") return <>{children}</>;

	return <NeedsDeviceEmptyState />;
}

function NeedsDeviceEmptyState() {
	const { t } = useTranslation();

	return (
		<EmptyState
			icon={Usb}
			title={t("needsDeviceTitle")}
			description={t("needsDeviceDescription")}
		>
			<ConnectButton />
		</EmptyState>
	);
}
