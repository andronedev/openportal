import { WirelessConnect } from "@/components/connection/WirelessPanel";
import { Modal } from "@/components/ui/primitives";
import { getPlatformSupport } from "@/lib/utils/platform";
import { useConnecting, useFleetStore } from "@/store/fleet-store";
import { Plus, Usb } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function AddDeviceMenu() {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const connectUsb = useFleetStore((s) => s.connectUsb);
	const isConnecting = useConnecting();
	const support = getPlatformSupport();

	const handleUsbConnect = async () => {
		const serial = await connectUsb();
		if (serial) setOpen(false);
	};

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				title={t("fleet.addDevice")}
				aria-label={t("fleet.addDevice")}
				className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			>
				<Plus className="h-3.5 w-3.5" />
			</button>
			<Modal
				open={open}
				onClose={() => setOpen(false)}
				title={t("fleet.addDevice")}
			>
				<div className="space-y-4">
					<button
						type="button"
						onClick={handleUsbConnect}
						disabled={!support.supported || isConnecting}
						className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						<Usb className="h-4 w-4" />
						{isConnecting ? t("connecting") : t("connectYourPortal")}
					</button>
					<WirelessConnect onConnected={() => setOpen(false)} />
				</div>
			</Modal>
		</>
	);
}
