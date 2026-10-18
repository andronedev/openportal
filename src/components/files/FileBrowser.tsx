import { Button, EmptyState, Spinner } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/primitives";
import {
	type FileEntry,
	joinPath,
	listDirectory,
	makeDirectory,
	parentPath,
	pullFile,
	pushFile,
	removePath,
} from "@/lib/adb/file-system";
import { downloadBlob } from "@/lib/utils/download";
import { formatBytes, formatTimestamp } from "@/lib/utils/format";
import { useActiveAdb } from "@/store/fleet-store";
import {
	ArrowUp,
	Download,
	File as FileIcon,
	Folder,
	FolderPlus,
	Link2,
	RefreshCw,
	Trash2,
	Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const DEFAULT_PATH = "/sdcard";

export function FileBrowser() {
	const { t } = useTranslation("tools");
	const adb = useActiveAdb();
	const [path, setPath] = useState(DEFAULT_PATH);
	const [entries, setEntries] = useState<FileEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [dragOver, setDragOver] = useState(false);
	const [pending, setPending] = useState<string | null>(null);
	const [toDelete, setToDelete] = useState<FileEntry | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const load = useCallback(
		async (target: string) => {
			if (!adb) return;
			setLoading(true);
			setError(null);
			try {
				const list = await listDirectory(adb, target);
				setEntries(list);
			} catch (err) {
				setEntries([]);
				setError(err instanceof Error ? err.message : t("files.loadError"));
			} finally {
				setLoading(false);
			}
		},
		[adb, t],
	);

	useEffect(() => {
		load(path);
	}, [path, load]);

	const upload = useCallback(
		async (files: FileList | File[]) => {
			if (!adb) return;
			for (const file of Array.from(files)) {
				const toastId = toast.loading(
					t("files.uploading", { name: file.name }),
				);
				setPending(file.name);
				try {
					await pushFile(adb, path, file);
					toast.success(t("files.uploaded", { name: file.name }), {
						id: toastId,
					});
				} catch (err) {
					toast.error(t("files.uploaded", { name: file.name }), {
						id: toastId,
						description: err instanceof Error ? err.message : undefined,
					});
				} finally {
					setPending(null);
				}
			}
			await load(path);
		},
		[adb, path, load, t],
	);

	const handleDownload = async (entry: FileEntry) => {
		if (!adb) return;
		setPending(entry.name);
		const toastId = toast.loading(entry.name);
		try {
			const data = await pullFile(adb, joinPath(path, entry.name));
			downloadBlob(data, entry.name);
			toast.success(t("files.downloaded", { name: entry.name }), {
				id: toastId,
			});
		} catch (err) {
			toast.error(entry.name, {
				id: toastId,
				description: err instanceof Error ? err.message : undefined,
			});
		} finally {
			setPending(null);
		}
	};

	const handleDelete = async (entry: FileEntry) => {
		if (!adb) return;
		try {
			await removePath(adb, joinPath(path, entry.name));
			toast.success(t("files.deleted", { name: entry.name }));
			await load(path);
		} catch (err) {
			toast.error(entry.name, {
				description: err instanceof Error ? err.message : undefined,
			});
		}
	};

	const handleNewFolder = async () => {
		if (!adb) return;
		const name = window.prompt(t("files.newFolderPrompt"));
		if (!name) return;
		try {
			await makeDirectory(adb, joinPath(path, name));
			toast.success(t("files.folderCreated"));
			await load(path);
		} catch (err) {
			toast.error(t("files.newFolder"), {
				description: err instanceof Error ? err.message : undefined,
			});
		}
	};

	const crumbs = path.split("/").filter(Boolean);

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-2">
				<Button
					variant="secondary"
					onClick={() => setPath(parentPath(path))}
					disabled={path === "/"}
					title={t("files.goUp")}
				>
					<ArrowUp className="h-4 w-4" />
				</Button>
				<Button variant="ghost" onClick={() => load(path)} disabled={loading}>
					<RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
				</Button>
				<div className="ml-auto flex gap-2">
					<Button variant="secondary" onClick={handleNewFolder}>
						<FolderPlus className="h-4 w-4" />
						{t("files.newFolder")}
					</Button>
					<Button
						variant="primary"
						onClick={() => fileInputRef.current?.click()}
						loading={pending !== null}
					>
						<Upload className="h-4 w-4" />
						{t("files.upload")}
					</Button>
					<input
						ref={fileInputRef}
						type="file"
						multiple
						className="hidden"
						onChange={(e) => {
							if (e.target.files) upload(e.target.files);
							e.target.value = "";
						}}
					/>
				</div>
			</div>

			{/* Breadcrumb */}
			<div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
				<button
					type="button"
					onClick={() => setPath("/")}
					className="rounded px-1 hover:text-foreground"
				>
					/
				</button>
				{crumbs.map((part, i) => {
					const target = `/${crumbs.slice(0, i + 1).join("/")}`;
					return (
						<span key={target} className="flex items-center gap-1">
							<button
								type="button"
								onClick={() => setPath(target)}
								className="rounded px-1 hover:text-foreground"
							>
								{part}
							</button>
							{i < crumbs.length - 1 && <span>/</span>}
						</span>
					);
				})}
			</div>

			<div
				onDragOver={(e) => {
					e.preventDefault();
					setDragOver(true);
				}}
				onDragLeave={() => setDragOver(false)}
				onDrop={(e) => {
					e.preventDefault();
					setDragOver(false);
					if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
				}}
				className={`overflow-hidden rounded-xl border transition-colors ${
					dragOver ? "border-foreground/50 bg-accent/30" : "border-border"
				}`}
			>
				{loading ? (
					<div className="flex justify-center py-16">
						<Spinner />
					</div>
				) : error ? (
					<div className="space-y-1 px-6 py-12 text-center">
						<p className="text-sm font-medium text-red-400">{error}</p>
						<p className="text-xs text-muted-foreground">
							{t("files.permissionHint")}
						</p>
					</div>
				) : entries.length === 0 ? (
					<EmptyState
						icon={Folder}
						title={t("files.empty")}
						description={t("files.emptyHint")}
					/>
				) : (
					<table className="w-full text-sm">
						<thead className="border-b border-border text-left text-xs text-muted-foreground">
							<tr>
								<th className="px-4 py-2 font-medium">{t("files.name")}</th>
								<th className="hidden px-4 py-2 font-medium sm:table-cell">
									{t("files.size")}
								</th>
								<th className="hidden px-4 py-2 font-medium md:table-cell">
									{t("files.modified")}
								</th>
								<th className="px-4 py-2" />
							</tr>
						</thead>
						<tbody>
							{entries.map((entry) => (
								<tr
									key={entry.name}
									className="border-b border-border/50 last:border-0 hover:bg-accent/30"
								>
									<td className="px-4 py-2">
										<button
											type="button"
											disabled={entry.type === "file"}
											onClick={() =>
												entry.type !== "file" &&
												setPath(joinPath(path, entry.name))
											}
											className="flex items-center gap-2 text-left enabled:hover:text-foreground"
										>
											<EntryIcon type={entry.type} />
											<span className="truncate">{entry.name}</span>
										</button>
									</td>
									<td className="hidden px-4 py-2 text-muted-foreground sm:table-cell">
										{entry.type === "file" ? formatBytes(entry.size) : "-"}
									</td>
									<td className="hidden px-4 py-2 text-muted-foreground md:table-cell">
										{formatTimestamp(entry.mtime)}
									</td>
									<td className="px-4 py-2">
										<div className="flex items-center justify-end gap-1">
											{entry.type === "file" && (
												<button
													type="button"
													onClick={() => handleDownload(entry)}
													disabled={pending !== null}
													title={t("files.download")}
													className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
												>
													<Download className="h-4 w-4" />
												</button>
											)}
											<button
												type="button"
												onClick={() => setToDelete(entry)}
												title={t("common:delete")}
												className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
											>
												<Trash2 className="h-4 w-4" />
											</button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>

			<ConfirmDialog
				open={toDelete !== null}
				onClose={() => setToDelete(null)}
				onConfirm={() => toDelete && handleDelete(toDelete)}
				title={t("files.deleteConfirmTitle", { name: toDelete?.name ?? "" })}
				message={t("files.deleteConfirmMessage")}
				confirmLabel={t("common:delete")}
				danger
			/>
		</div>
	);
}

function EntryIcon({ type }: { type: FileEntry["type"] }) {
	if (type === "directory")
		return <Folder className="h-4 w-4 shrink-0 text-sky-500" />;
	if (type === "link")
		return <Link2 className="h-4 w-4 shrink-0 text-violet-500" />;
	return <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />;
}
