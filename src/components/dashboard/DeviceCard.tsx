import { useActiveDeviceInfo, useActivePortalModel } from "@/store/fleet-store";
import { Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";

interface StatusFlag {
	labelKey: string;
	value: boolean;
	positiveKey: string;
	negativeKey: string;
}

export function DeviceCard() {
	const { t } = useTranslation("dashboard");
	const deviceInfo = useActiveDeviceInfo();
	const portalModel = useActivePortalModel();

	if (!deviceInfo || !portalModel) return null;

	const flags: StatusFlag[] = [
		{
			labelKey: "testHarness",
			value: deviceInfo.testHarnessActive,
			positiveKey: "active",
			negativeKey: "inactive",
		},
		{
			labelKey: "adb",
			value: deviceInfo.adbPersistent,
			positiveKey: "active",
			negativeKey: "inactive",
		},
		{
			labelKey: "bootloaderLocked",
			value: deviceInfo.bootloaderLocked,
			positiveKey: "locked",
			negativeKey: "unlocked",
		},
	];

	return (
		<div className="flex items-start gap-6 rounded-xl border border-border bg-card p-6">
			<div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-secondary">
				<Smartphone className="h-10 w-10 text-muted-foreground" />
			</div>
			<div className="min-w-0 flex-1">
				<h2 className="text-xl font-semibold">{portalModel.displayName}</h2>
				<div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
					<InfoRow label={t("firmware")} value={deviceInfo.buildId} />
					<InfoRow
						label={t("android")}
						value={`${deviceInfo.androidVersion} (API ${deviceInfo.apiLevel})`}
					/>
					<InfoRow label={t("soc")} value={deviceInfo.socModel.toUpperCase()} />
					<InfoRow label={t("serial")} value={deviceInfo.serial} mono />
					<InfoRow label={t("kernel")} value={deviceInfo.kernelVersion} />
					<InfoRow
						label={t("securityPatch")}
						value={deviceInfo.securityPatch}
					/>
				</div>
				<div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
					{flags.map((flag) => (
						<div
							key={flag.labelKey}
							className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-1.5"
						>
							<div
								className={`h-2 w-2 shrink-0 rounded-full ${
									flag.value ? "bg-emerald-500" : "bg-zinc-500"
								}`}
							/>
							<span className="text-xs text-muted-foreground">
								{t(flag.labelKey)}
							</span>
							<span className="text-xs font-medium">
								{t(flag.value ? flag.positiveKey : flag.negativeKey)}
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function InfoRow({
	label,
	value,
	mono,
}: { label: string; value: string; mono?: boolean }) {
	return (
		<div className="flex items-baseline gap-2">
			<span className="text-muted-foreground">{label}</span>
			<span className={`truncate ${mono ? "font-mono text-xs" : ""}`}>
				{value || "-"}
			</span>
		</div>
	);
}
