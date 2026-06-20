import { useAppStore } from "@/store/app-store";
import { useDeviceStore } from "@/store/device-store";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function useSetupPanel() {
	const { t } = useTranslation("apps");
	const connect = useDeviceStore((s) => s.connect);
	const [open, setOpen] = useState(false);
	const [connecting, setConnecting] = useState(false);

	const openPanel = async (skipIfInstalled?: {
		packageName: string;
		name: string;
	}) => {
		if (!useDeviceStore.getState().adb) {
			setConnecting(true);
			try {
				await connect();
			} finally {
				setConnecting(false);
			}
			if (!useDeviceStore.getState().adb) return;
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
