import { formatBytes, formatStoragePercent } from "@/lib/utils/format";
import { useActiveDeviceInfo, useActivePortalModel } from "@/store/fleet-store";
import { useTranslation } from "react-i18next";
import { DeviceSnapshot } from "./DeviceSnapshot";

/**
 * Welcoming, non-technical header for the Classic dashboard: a live snapshot of
 * the device next to its name, connection state, and a compact storage gauge.
 * The full technical spec sheet lives in the Advanced dashboard instead.
 */
export function DeviceHero() {
	const { t } = useTranslation("dashboard");
	const deviceInfo = useActiveDeviceInfo();
	const portalModel = useActivePortalModel();

	if (!deviceInfo || !portalModel) return null;

	const hasStorage = deviceInfo.storageTotal > 0;
	const percent = hasStorage
		? formatStoragePercent(deviceInfo.storageUsed, deviceInfo.storageTotal)
		: 0;
	const barColor =
		percent > 90
			? "bg-red-500"
			: percent > 70
				? "bg-amber-500"
				: "bg-emerald-500";

	return (
		<div className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-card p-6 text-center sm:flex-row sm:gap-8 sm:p-8 sm:text-left">
			<DeviceSnapshot />
			<div className="min-w-0 flex-1">
				<span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-500">
					<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
					{t("connected", { ns: "common" })}
				</span>
				<h1 className="mt-3 text-2xl font-semibold sm:text-3xl">
					{portalModel.displayName}
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					{t("heroSubtitle", {
						screen: portalModel.screenSize,
						android: deviceInfo.androidVersion,
					})}
				</p>

				{hasStorage && (
					<div className="mx-auto mt-5 w-full max-w-xs sm:mx-0">
						<div className="h-1.5 overflow-hidden rounded-full bg-secondary">
							<div
								className={`h-full rounded-full transition-all ${barColor}`}
								style={{ width: `${percent}%` }}
							/>
						</div>
						<div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
							<span>
								{t("storageUsed", {
									used: formatBytes(deviceInfo.storageUsed),
									total: formatBytes(deviceInfo.storageTotal),
								})}
							</span>
							<span>
								{t("storageFree", {
									free: formatBytes(deviceInfo.storageFree),
								})}
							</span>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
