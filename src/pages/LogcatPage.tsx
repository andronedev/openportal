import { ConnectGate } from "@/components/connection/ConnectGate";
import { Button, PageHeader } from "@/components/ui/primitives";
import {
	type LogLine,
	type LogPriority,
	type LogcatHandle,
	streamLogcat,
} from "@/lib/adb/logcat";
import { downloadBlob } from "@/lib/utils/download";
import { useActiveAdb } from "@/store/fleet-store";
import { Download, Play, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const MAX_LINES = 5000;

const PRIORITIES: (LogPriority | "all")[] = [
	"all",
	"V",
	"D",
	"I",
	"W",
	"E",
	"F",
];

const PRIORITY_RANK: Record<LogPriority | "?", number> = {
	V: 0,
	D: 1,
	I: 2,
	W: 3,
	E: 4,
	F: 5,
	"?": 0,
};

const PRIORITY_COLOR: Record<LogPriority | "?", string> = {
	V: "text-zinc-400",
	D: "text-sky-400",
	I: "text-emerald-400",
	W: "text-amber-400",
	E: "text-red-400",
	F: "text-red-500 font-bold",
	"?": "text-muted-foreground",
};

export function LogcatPage() {
	const { t } = useTranslation("tools");
	const adb = useActiveAdb();
	const [lines, setLines] = useState<LogLine[]>([]);
	const [running, setRunning] = useState(false);
	const [tagFilter, setTagFilter] = useState("");
	const [search, setSearch] = useState("");
	const [minPriority, setMinPriority] = useState<LogPriority | "all">("all");
	const [autoscroll, setAutoscroll] = useState(true);

	const handleRef = useRef<LogcatHandle | null>(null);
	const startingRef = useRef(false);
	const bufferRef = useRef<LogLine[]>([]);
	const scrollRef = useRef<HTMLDivElement>(null);

	// Batch incoming lines and flush on a timer to avoid a re-render per line.
	useEffect(() => {
		const interval = setInterval(() => {
			if (bufferRef.current.length === 0) return;
			const incoming = bufferRef.current;
			bufferRef.current = [];
			setLines((prev) => {
				const next = prev.concat(incoming);
				return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
			});
		}, 200);
		return () => clearInterval(interval);
	}, []);

	const stop = useCallback(async () => {
		await handleRef.current?.stop();
		handleRef.current = null;
		setRunning(false);
	}, []);

	const start = useCallback(async () => {
		if (!adb || handleRef.current || startingRef.current) return;
		startingRef.current = true;
		setRunning(true);
		try {
			handleRef.current = await streamLogcat(
				adb,
				(line) => bufferRef.current.push(line),
				(err) => {
					toast.error("logcat", {
						description: err instanceof Error ? err.message : undefined,
					});
					setRunning(false);
				},
			);
		} catch (err) {
			toast.error("logcat", {
				description: err instanceof Error ? err.message : undefined,
			});
			setRunning(false);
		} finally {
			startingRef.current = false;
		}
	}, [adb]);

	// Start streaming as soon as the page opens, and stop on leave.
	useEffect(() => {
		start();
		return () => {
			handleRef.current?.stop();
			handleRef.current = null;
		};
	}, [start]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: adb is not read here, only used to key the reset on device switch.
	useEffect(() => {
		bufferRef.current = [];
		setLines([]);
	}, [adb]);

	const filtered = useMemo(() => {
		const tag = tagFilter.toLowerCase();
		const query = search.toLowerCase();
		const min = minPriority === "all" ? -1 : PRIORITY_RANK[minPriority];
		return lines.filter((line) => {
			if (min >= 0 && PRIORITY_RANK[line.priority] < min) return false;
			if (tag && !line.tag.toLowerCase().includes(tag)) return false;
			if (query && !line.raw.toLowerCase().includes(query)) return false;
			return true;
		});
	}, [lines, tagFilter, search, minPriority]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll to bottom whenever new lines render
	useEffect(() => {
		if (autoscroll && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [filtered, autoscroll]);

	const handleExport = () => {
		const text = lines.map((l) => l.raw).join("\n");
		const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
		downloadBlob(text, `logcat-${stamp}.txt`, "text/plain");
	};

	return (
		<div className="mx-auto flex h-full max-w-4xl flex-col space-y-6">
			<PageHeader title={t("logcat.title")} />

			<ConnectGate>
				<div className="flex flex-wrap items-center gap-2">
					{running ? (
						<Button variant="danger" onClick={stop}>
							<Square className="h-4 w-4" />
							{t("logcat.stop")}
						</Button>
					) : (
						<Button variant="primary" onClick={start}>
							<Play className="h-4 w-4" />
							{t("logcat.start")}
						</Button>
					)}
					<Button variant="ghost" onClick={() => setLines([])}>
						<Trash2 className="h-4 w-4" />
						{t("logcat.clear")}
					</Button>
					<Button
						variant="ghost"
						onClick={handleExport}
						disabled={lines.length === 0}
					>
						<Download className="h-4 w-4" />
						{t("logcat.download")}
					</Button>

					<input
						value={tagFilter}
						onChange={(e) => setTagFilter(e.target.value)}
						placeholder={t("logcat.filterTag")}
						className="w-32 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
					/>
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder={t("logcat.search")}
						className="min-w-40 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
					/>
					<select
						value={minPriority}
						onChange={(e) =>
							setMinPriority(e.target.value as LogPriority | "all")
						}
						className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
					>
						{PRIORITIES.map((p) => (
							<option key={p} value={p}>
								{p === "all" ? t("logcat.priorityAll") : p}
							</option>
						))}
					</select>
					<label className="flex items-center gap-1.5 text-sm text-muted-foreground">
						<input
							type="checkbox"
							checked={autoscroll}
							onChange={(e) => setAutoscroll(e.target.checked)}
						/>
						{t("logcat.autoscroll")}
					</label>
				</div>

				<div
					ref={scrollRef}
					className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-black/40 p-3 font-mono text-xs leading-relaxed"
				>
					{filtered.length === 0 ? (
						<div className="flex h-full items-center justify-center text-muted-foreground">
							{t("logcat.empty")}
						</div>
					) : (
						filtered.map((line) => (
							<div key={line.id} className="whitespace-pre-wrap break-all">
								<span className="text-muted-foreground">{line.time} </span>
								<span className={PRIORITY_COLOR[line.priority]}>
									{line.priority}{" "}
								</span>
								{line.tag && (
									<span className="text-violet-400">{line.tag}: </span>
								)}
								<span>{line.message}</span>
							</div>
						))
					)}
				</div>

				<div className="flex items-center justify-between text-xs text-muted-foreground">
					<span>{running ? t("logcat.streaming") : t("logcat.paused")}</span>
					<span>{t("logcat.lines", { count: filtered.length })}</span>
				</div>
			</ConnectGate>
		</div>
	);
}
