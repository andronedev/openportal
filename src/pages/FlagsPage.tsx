import { ConnectGate } from "@/components/connection/ConnectGate";
import {
	Button,
	ConfirmDialog,
	EmptyState,
	PageHeader,
	Spinner,
} from "@/components/ui/primitives";
import {
	DEVICE_CONFIG_NAMESPACES,
	type Flag,
	type FlagSource,
	SETTINGS_NAMESPACES,
	deleteFlag,
	listFlags,
	putFlag,
} from "@/lib/adb/device-config";
import { useActiveAdb } from "@/store/fleet-store";
import { AlertTriangle, Check, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function FlagsPage() {
	const { t } = useTranslation("tools");
	const adb = useActiveAdb();
	const [source, setSource] = useState<FlagSource>("settings");
	const [namespace, setNamespace] = useState<string>("global");
	const [flags, setFlags] = useState<Flag[]>([]);
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [loading, setLoading] = useState(false);
	const [search, setSearch] = useState("");
	const [newKey, setNewKey] = useState("");
	const [newValue, setNewValue] = useState("");
	const [toReset, setToReset] = useState<string | null>(null);

	const namespaceOptions =
		source === "settings" ? SETTINGS_NAMESPACES : DEVICE_CONFIG_NAMESPACES;

	const load = useCallback(async () => {
		if (!adb) return;
		setLoading(true);
		try {
			const list = await listFlags(adb, source, namespace);
			setFlags(list);
			setDrafts(Object.fromEntries(list.map((f) => [f.key, f.value])));
		} catch (err) {
			setFlags([]);
			toast.error(t("flags.title"), {
				description: err instanceof Error ? err.message : undefined,
			});
		} finally {
			setLoading(false);
		}
	}, [adb, source, namespace, t]);

	useEffect(() => {
		load();
	}, [load]);

	const handleSourceChange = (next: FlagSource) => {
		setSource(next);
		setNamespace(next === "settings" ? "global" : "privacy");
	};

	const handleSave = async (key: string) => {
		if (!adb) return;
		try {
			await putFlag(adb, source, namespace, key, drafts[key] ?? "");
			toast.success(t("flags.saved"), { description: key });
			setFlags((prev) =>
				prev.map((f) =>
					f.key === key ? { ...f, value: drafts[key] ?? "" } : f,
				),
			);
		} catch (err) {
			toast.error(key, {
				description: err instanceof Error ? err.message : undefined,
			});
		}
	};

	const handleAdd = async () => {
		if (!adb || !newKey.trim()) return;
		try {
			await putFlag(adb, source, namespace, newKey.trim(), newValue);
			toast.success(t("flags.saved"), { description: newKey.trim() });
			setNewKey("");
			setNewValue("");
			await load();
		} catch (err) {
			toast.error(newKey, {
				description: err instanceof Error ? err.message : undefined,
			});
		}
	};

	const handleReset = async (key: string) => {
		if (!adb) return;
		try {
			await deleteFlag(adb, source, namespace, key);
			toast.success(t("flags.saved"), { description: key });
			await load();
		} catch (err) {
			toast.error(key, {
				description: err instanceof Error ? err.message : undefined,
			});
		}
	};

	const filtered = useMemo(() => {
		const query = search.toLowerCase();
		if (!query) return flags;
		return flags.filter(
			(f) =>
				f.key.toLowerCase().includes(query) ||
				f.value.toLowerCase().includes(query),
		);
	}, [flags, search]);

	return (
		<div className="mx-auto max-w-4xl space-y-6">
			<PageHeader title={t("flags.title")} />

			<ConnectGate>
				<div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
					<AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
					<span>{t("flags.warning")}</span>
				</div>

				<div className="flex flex-wrap items-end gap-3">
					<label className="flex flex-col gap-1 text-xs text-muted-foreground">
						{t("flags.source")}
						<select
							value={source}
							onChange={(e) => handleSourceChange(e.target.value as FlagSource)}
							className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
						>
							<option value="settings">{t("flags.sourceSettings")}</option>
							<option value="device_config">
								{t("flags.sourceDeviceConfig")}
							</option>
						</select>
					</label>

					<label className="flex flex-col gap-1 text-xs text-muted-foreground">
						{t("flags.namespace")}
						<input
							list="namespace-options"
							value={namespace}
							onChange={(e) => setNamespace(e.target.value)}
							className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
						/>
						<datalist id="namespace-options">
							{namespaceOptions.map((ns) => (
								<option key={ns} value={ns} />
							))}
						</datalist>
					</label>

					<Button variant="secondary" onClick={load} loading={loading}>
						{t("flags.loadNamespace")}
					</Button>

					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder={t("flags.search")}
						className="ml-auto min-w-48 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
					/>
				</div>

				{/* Add / override */}
				<div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
					<input
						value={newKey}
						onChange={(e) => setNewKey(e.target.value)}
						placeholder={t("flags.key")}
						className="min-w-40 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono"
					/>
					<input
						value={newValue}
						onChange={(e) => setNewValue(e.target.value)}
						placeholder={t("flags.value")}
						className="min-w-40 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono"
					/>
					<Button
						variant="primary"
						onClick={handleAdd}
						disabled={!newKey.trim()}
					>
						<Plus className="h-4 w-4" />
						{t("flags.add")}
					</Button>
				</div>

				{loading ? (
					<div className="flex justify-center py-16">
						<Spinner />
					</div>
				) : filtered.length === 0 ? (
					<EmptyState title={t("flags.empty")} />
				) : (
					<div className="overflow-hidden rounded-xl border border-border">
						<table className="w-full text-sm">
							<thead className="border-b border-border text-left text-xs text-muted-foreground">
								<tr>
									<th className="px-4 py-2 font-medium">{t("flags.key")}</th>
									<th className="px-4 py-2 font-medium">{t("flags.value")}</th>
									<th className="px-4 py-2" />
								</tr>
							</thead>
							<tbody>
								{filtered.map((flag) => {
									const dirty = (drafts[flag.key] ?? "") !== flag.value;
									return (
										<tr
											key={flag.key}
											className="border-b border-border/50 last:border-0"
										>
											<td className="px-4 py-2 font-mono text-xs">
												{flag.key}
											</td>
											<td className="px-4 py-2">
												<input
													value={drafts[flag.key] ?? ""}
													onChange={(e) =>
														setDrafts((prev) => ({
															...prev,
															[flag.key]: e.target.value,
														}))
													}
													className="w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
												/>
											</td>
											<td className="px-4 py-2">
												<div className="flex items-center justify-end gap-1">
													<button
														type="button"
														onClick={() => handleSave(flag.key)}
														disabled={!dirty}
														title={t("common:save")}
														className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-emerald-500 disabled:opacity-30"
													>
														<Check className="h-4 w-4" />
													</button>
													<button
														type="button"
														onClick={() => setToReset(flag.key)}
														title={t("flags.reset")}
														className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
													>
														<RotateCcw className="h-4 w-4" />
													</button>
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}

				<ConfirmDialog
					open={toReset !== null}
					onClose={() => setToReset(null)}
					onConfirm={() => toReset && handleReset(toReset)}
					title={t("flags.resetConfirmTitle", { key: toReset ?? "" })}
					message={t("flags.resetConfirmMessage")}
					confirmLabel={t("flags.reset")}
					danger
				/>
			</ConnectGate>
		</div>
	);
}
