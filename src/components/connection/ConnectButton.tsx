import { Button } from "@/components/ui/primitives";
import { getPlatformSupport } from "@/lib/utils/platform";
import {
	useActiveState,
	useConnecting,
	useFleetStore,
} from "@/store/fleet-store";
import { Usb } from "lucide-react";
import { useTranslation } from "react-i18next";

export function ConnectButton() {
	const { t } = useTranslation();
	const connectUsb = useFleetStore((s) => s.connectUsb);
	const connected = useActiveState() === "connected";
	const isConnecting = useConnecting();

	if (connected) return null;

	const support = getPlatformSupport();

	return (
		<Button
			variant="primary"
			onClick={() => connectUsb()}
			disabled={!support.supported || isConnecting}
			loading={isConnecting}
		>
			{!isConnecting && <Usb className="h-4 w-4" />}
			{isConnecting ? t("connecting") : t("connect")}
		</Button>
	);
}
