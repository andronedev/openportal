import { Button, ConfirmDialog, Modal } from "@/components/ui/primitives";
import {
	DEVICE_CONFIG_NAMESPACES,
	type FlagSource,
	SETTINGS_NAMESPACES,
	putFlag,
} from "@/lib/adb/device-config";
import { reboot } from "@/lib/adb/shell";
import { useAppStore } from "@/store/app-store";
import {
	type DeviceConnection,
	useFleetConnections,
	useFleetStore,
	useSelectedSerials,
} from "@/store/fleet-store";
import { FileUp, Power, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

function deviceLabel(connection: DeviceConnection): string {
	return (
		connection.portalModel?.displayName ??
		connection.deviceInfo?.model ??
		connection.name ??
		connection.serial
	);
}

export function BulkActionBar() {
	const { t } = useTranslation();
	const selected = useSelectedSerials();
	const connections = useFleetConnections();
	const clearSelected = useFleetStore((s) => s.clearSelected);
	const rawConnections = useFleetStore((s) => s.connections);
	const installFile = useAppStore((s) => s.installFile);
	const uninstall = useAppStore((s) => s.uninstall);

	const targets = connections.filter((c) => selected[c.serial]);

	const [confirmReboot, setConfirmReboot] = useState(false);
	const [uninstallOpen, setUninstallOpen] = useState(false);
	const [packageName, setPackageName] = useState("");
	const [confirmUninstall, setConfirmUninstall] = useState(false);
	const [flagOpen, setFlagOpen] = useState(false);
	const [source, setSource] = useState<FlagSource>("settings");
	const [namespace, setNamespace] = useState("global");
	const [flagKey, setFlagKey] = useState("");
	const [flagValue, setFlagValue] = useState("");
	const fileInputRef = useRef<HTMLInputElement>(null);

	if (targets.length === 0) return null;

	const namespaceOptions =
		source === "settings" ? SETTINGS_NAMESPACES : DEVICE_CONFIG_NAMESPACES;

	const runBulk = async (
		title: string,
		action: (connection: DeviceConnection) => Promise<void>,
	) => {
		const results = await Promise.allSettled(targets.map(action));
		const failed = targets.filter((_, i) => results[i]?.status === "rejected");
		if (failed.length === 0) {
			toast.success(title, {
				description: t("bulk.done", { count: targets.length }),
			});
		} else {
			toast.error(title, {
				description: t("bulk.failedOn", {
					names: failed.map(deviceLabel).join(", "),
				}),
			});
		}
	};

	const handleInstallChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		runBulk(t("bulk.install"), (c) => installFile(file, c.serial));
	};

	const handleReboot = () =>
		runBulk(t("bulk.reboot"), async (c) => {
			const adb = rawConnections[c.serial]?.adb;
			if (!adb) throw new Error("not connected");
			await reboot(adb);
		});

	const handleUninstall = () => {
		const target = packageName.trim();
		if (!target) return;
		runBulk(t("bulk.uninstall"), (c) => uninstall(target, c.serial));
		setPackageName("");
		setUninstallOpen(false);
	};

	const handleSetFlag = () => {
		const key = flagKey.trim();
		if (!key) return;
		runBulk(t("bulk.setFlag"), async (c) => {
			const adb = rawConnections[c.serial]?.adb;
			if (!adb) throw new Error("not connected");
			await putFlag(adb, source, namespace, key, flagValue);
		});
		setFlagKey("");
		setFlagValue("");
		setFlagOpen(false);
	};

	return (
		<>
			<div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
				<div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-xl">
					<button
						type="button"
						onClick={clearSelected}
						title={t("bulk.clearSelection")}
						aria-label={t("bulk.clearSelection")}
						className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<X className="h-4 w-4" />
						{t("bulk.selectedCount", { count: targets.length })}
					</button>
					<div className="h-5 w-px bg-border" />
					<Button variant="ghost" onClick={() => fileInputRef.current?.click()}>
						<FileUp className="h-4 w-4" />
						{t("bulk.install")}
					</Button>
					<Button variant="ghost" onClick={() => setConfirmReboot(true)}>
						<Power className="h-4 w-4" />
						{t("bulk.reboot")}
					</Button>
					<Button variant="ghost" onClick={() => setUninstallOpen(true)}>
						<Trash2 className="h-4 w-4" />
						{t("bulk.uninstall")}
					</Button>
					<Button variant="ghost" onClick={() => setFlagOpen(true)}>
						<SlidersHorizontal className="h-4 w-4" />
						{t("bulk.setFlag")}
					</Button>
				</div>
			</div>

			<input
				ref={fileInputRef}
				type="file"
				accept=".apk"
				className="hidden"
				onChange={handleInstallChange}
			/>

			<ConfirmDialog
				open={confirmReboot}
				onClose={() => setConfirmReboot(false)}
				onConfirm={handleReboot}
				title={t("bulk.reboot")}
				message={t("bulk.rebootConfirm", { count: targets.length })}
				confirmLabel={t("bulk.reboot")}
				danger
			/>

			<Modal
				open={uninstallOpen}
				onClose={() => setUninstallOpen(false)}
				title={t("bulk.uninstall")}
			>
				<div className="space-y-3">
					<p className="text-xs text-muted-foreground">
						{t("bulk.runningOn", { count: targets.length })}
					</p>
					<input
						value={packageName}
						onChange={(e) => setPackageName(e.target.value)}
						placeholder={t("bulk.packageNamePlaceholder")}
						className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
					/>
					<Button
						variant="danger"
						className="w-full"
						disabled={!packageName.trim()}
						onClick={() => setConfirmUninstall(true)}
					>
						{t("bulk.uninstall")}
					</Button>
				</div>
			</Modal>

			<ConfirmDialog
				open={confirmUninstall}
				onClose={() => setConfirmUninstall(false)}
				onConfirm={handleUninstall}
				title={t("bulk.uninstall")}
				message={t("bulk.uninstallConfirm", {
					name: packageName.trim(),
					count: targets.length,
				})}
				confirmLabel={t("bulk.uninstall")}
				danger
			/>

			<Modal
				open={flagOpen}
				onClose={() => setFlagOpen(false)}
				title={t("bulk.setFlag")}
			>
				<div className="space-y-3">
					<p className="text-xs text-muted-foreground">
						{t("bulk.runningOn", { count: targets.length })}
					</p>
					<div className="flex flex-wrap items-end gap-3">
						<label className="flex flex-col gap-1 text-xs text-muted-foreground">
							{t("tools:flags.source")}
							<select
								value={source}
								onChange={(e) => {
									const next = e.target.value as FlagSource;
									setSource(next);
									setNamespace(next === "settings" ? "global" : "privacy");
								}}
								className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
							>
								<option value="settings">
									{t("tools:flags.sourceSettings")}
								</option>
								<option value="device_config">
									{t("tools:flags.sourceDeviceConfig")}
								</option>
							</select>
						</label>
						<label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
							{t("tools:flags.namespace")}
							<input
								list="bulk-namespace-options"
								value={namespace}
								onChange={(e) => setNamespace(e.target.value)}
								className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
							/>
							<datalist id="bulk-namespace-options">
								{namespaceOptions.map((ns) => (
									<option key={ns} value={ns} />
								))}
							</datalist>
						</label>
					</div>
					<input
						value={flagKey}
						onChange={(e) => setFlagKey(e.target.value)}
						placeholder={t("tools:flags.key")}
						className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
					/>
					<input
						value={flagValue}
						onChange={(e) => setFlagValue(e.target.value)}
						placeholder={t("tools:flags.value")}
						className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
					/>
					<Button
						variant="primary"
						className="w-full"
						disabled={!flagKey.trim()}
						onClick={handleSetFlag}
					>
						{t("bulk.setFlag")}
					</Button>
				</div>
			</Modal>
		</>
	);
}
