import { Modal } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useAppStore, useInstallTasks } from "@/store/app-store";
import { FileUp, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

/** Shared install logic: validate the file is an APK, run it, surface toasts. */
function useApkInstall() {
	const { t } = useTranslation("apps");
	const installFile = useAppStore((s) => s.installFile);
	const installTasks = useInstallTasks();

	const handleFile = useCallback(
		async (file: File) => {
			if (!file.name.endsWith(".apk")) {
				toast.error(t("notAnApk"), { description: file.name });
				return;
			}
			try {
				await installFile(file);
				toast.success(t("installed"), { description: file.name });
			} catch (err) {
				toast.error(t("installFailed"), {
					description: err instanceof Error ? err.message : file.name,
				});
			}
		},
		[installFile, t],
	);

	return { handleFile, installTasks };
}

/** Modal launched from the page header: browse for an APK + watch progress. */
export function ApkInstallModal({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const { t } = useTranslation("apps");
	const { handleFile, installTasks } = useApkInstall();
	const inputRef = useRef<HTMLInputElement>(null);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) handleFile(file);
		e.target.value = "";
	};

	const active = installTasks.filter(
		(task) => task.status !== "done" && task.status !== "error",
	);
	const errored = installTasks.filter((task) => task.status === "error");

	const statusLabel = (status: string) =>
		t(
			status === "pushing"
				? "statusPushing"
				: status === "installing"
					? "installingApp"
					: "statusQueued",
		);

	return (
		<Modal open={open} onClose={onClose} title={t("installApk")}>
			<div className="space-y-3">
				<button
					type="button"
					onClick={() => inputRef.current?.click()}
					className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border p-8 text-center transition-colors hover:border-foreground/30 hover:bg-accent/30"
				>
					<FileUp className="h-8 w-8 text-muted-foreground" />
					<p className="text-sm text-muted-foreground">{t("dragDropApk")}</p>
				</button>

				<input
					ref={inputRef}
					type="file"
					accept=".apk"
					className="hidden"
					onChange={handleChange}
				/>

				{active.map((task) => (
					<div
						key={task.id}
						className="space-y-2 rounded-lg border border-border bg-card px-4 py-3"
					>
						<div className="flex items-center justify-between gap-3 text-sm">
							<span className="truncate font-medium">{task.fileName}</span>
							<span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
								<Loader2 className="h-3 w-3 animate-spin" />
								{statusLabel(task.status)}
								{task.status === "pushing" && <> {task.progress}%</>}
							</span>
						</div>
						<div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
							<div
								className={cn(
									"h-full rounded-full bg-foreground transition-all",
									task.status === "installing" && "animate-pulse",
								)}
								style={{
									width: `${task.status === "installing" ? 100 : task.progress}%`,
								}}
							/>
						</div>
					</div>
				))}

				{errored.map((task) => (
					<div
						key={task.id}
						className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400"
					>
						{task.fileName}: {task.error}
					</div>
				))}
			</div>
		</Modal>
	);
}

/**
 * Full-window drop target: drag an APK anywhere on the page to install it.
 * Drag events are tracked on `window` with a counter so the overlay doesn't
 * flicker while the cursor crosses child elements.
 */
export function ApkDropOverlay() {
	const { t } = useTranslation("apps");
	const { handleFile } = useApkInstall();
	const [active, setActive] = useState(false);
	const counter = useRef(0);

	useEffect(() => {
		const hasFiles = (e: DragEvent) =>
			Array.from(e.dataTransfer?.types ?? []).includes("Files");

		const onEnter = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			counter.current += 1;
			setActive(true);
		};
		const onLeave = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			counter.current -= 1;
			if (counter.current <= 0) {
				counter.current = 0;
				setActive(false);
			}
		};
		const onOver = (e: DragEvent) => {
			if (hasFiles(e)) e.preventDefault();
		};
		const onDrop = (e: DragEvent) => {
			e.preventDefault();
			counter.current = 0;
			setActive(false);
			const file = e.dataTransfer?.files[0];
			if (file) handleFile(file);
		};

		window.addEventListener("dragenter", onEnter);
		window.addEventListener("dragleave", onLeave);
		window.addEventListener("dragover", onOver);
		window.addEventListener("drop", onDrop);
		return () => {
			window.removeEventListener("dragenter", onEnter);
			window.removeEventListener("dragleave", onLeave);
			window.removeEventListener("dragover", onOver);
			window.removeEventListener("drop", onDrop);
		};
	}, [handleFile]);

	return (
		<div
			className={cn(
				"pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm transition-opacity",
				active ? "opacity-100" : "opacity-0",
			)}
		>
			{active && (
				<div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-foreground/40 bg-card/80 px-12 py-16 text-center">
					<FileUp className="h-10 w-10 text-foreground" />
					<p className="text-base font-medium">{t("dropToInstall")}</p>
				</div>
			)}
		</div>
	);
}
