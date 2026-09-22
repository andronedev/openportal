import { formatBytes, formatStoragePercent } from "@/lib/utils/format";
import { useActiveDeviceInfo } from "@/store/fleet-store";
import { HardDrive } from "lucide-react";
import { useTranslation } from "react-i18next";

export function StorageBar() {
	const { t } = useTranslation("dashboard");
	const deviceInfo = useActiveDeviceInfo();

	if (!deviceInfo || deviceInfo.storageTotal === 0) return null;

	const percent = formatStoragePercent(
		deviceInfo.storageUsed,
		deviceInfo.storageTotal,
	);

	return (
		<div className="rounded-xl border border-border bg-card p-6">
			<div className="mb-3 flex items-center gap-2">
				<HardDrive className="h-4 w-4 text-muted-foreground" />
				<h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
					{t("storage")}
				</h3>
			</div>
			<div className="mb-2 h-2 overflow-hidden rounded-full bg-secondary">
				<div
					className={`h-full rounded-full transition-all ${
						percent > 90
							? "bg-red-500"
							: percent > 70
								? "bg-amber-500"
								: "bg-emerald-500"
					}`}
					style={{ width: `${percent}%` }}
				/>
			</div>
			<div className="flex justify-between text-xs text-muted-foreground">
				<span>
					{t("storageUsed", {
						used: formatBytes(deviceInfo.storageUsed),
						total: formatBytes(deviceInfo.storageTotal),
					})}
				</span>
				<span>
					{t("storageFree", { free: formatBytes(deviceInfo.storageFree) })}
				</span>
			</div>
		</div>
	);
}
