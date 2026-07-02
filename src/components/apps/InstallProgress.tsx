import type { InstallStage } from "@/lib/adb/install";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export function InstallProgress({
	stage,
	percent,
}: {
	stage: InstallStage;
	percent: number | null;
}) {
	const { t } = useTranslation("apps");
	const indeterminate = percent === null || stage !== "downloading";

	return (
		<div className="min-w-0 flex-1 space-y-1.5 rounded-lg bg-secondary px-3 py-2">
			<span className="flex items-center justify-center gap-1.5 text-xs font-medium">
				<Loader2 className="h-3.5 w-3.5 animate-spin" />
				{t(stage === "downloading" ? "downloading" : "installingApp")}
				{!indeterminate && (
					<span className="tabular-nums text-muted-foreground">{percent}%</span>
				)}
			</span>
			<div className="h-1 w-full overflow-hidden rounded-full bg-background/60">
				<div
					className={cn(
						"h-full rounded-full bg-foreground transition-all",
						indeterminate && "animate-pulse",
					)}
					style={{ width: `${indeterminate ? 100 : percent}%` }}
				/>
			</div>
		</div>
	);
}
