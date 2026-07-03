import { useAppStore } from "@/store/app-store";
import { getActiveAdb, useFleetStore } from "@/store/fleet-store";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function useSetupPanel() {
	const { t } = useTranslation("apps");
	const connectUsb = useFleetStore((s) => s.connectUsb);
	const [open, setOpen] = useState(false);
	const [connecting, setConnecting] = useState(false);

	const openPanel = async (skipIfInstalled?: {
		packageName: string;
		name: string;
	}) => {
		if (!getActiveAdb()) {
			setConnecting(true);
			try {
				await connectUsb();
			} finally {
				setConnecting(false);
			}
			if (!getActiveAdb()) return;
			if (skipIfInstalled) {
				await useAppStore.getState().refreshInstalled();
				if (useAppStore.getState().isInstalled(skipIfInstalled.packageName)) {
					toast.info(skipIfInstalled.name, {
						description: t("alreadyInstalled"),
					});
					return;
				}
			}
		}
		setOpen(true);
	};

	return { open, setOpen, openPanel, connecting };
}
