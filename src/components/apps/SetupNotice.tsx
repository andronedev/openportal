import type { AppProgram } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { ChevronRight, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

export function SetupNotice({
	program,
	className,
}: {
	program: AppProgram;
	className?: string;
}) {
	const { t } = useTranslation("apps");
	if (program.kind !== "commands") return null;
	const auto = program.auto === true;

	return (
		<details
			className={cn(
				"group rounded-lg border border-border bg-background/50 text-xs",
				className,
			)}
		>
			<summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
				<ShieldAlert className="h-3.5 w-3.5 shrink-0 text-sky-500" />
				<span className="flex-1 text-left">
					{t(auto ? "setupNoticeAuto" : "setupNoticeManual")}
				</span>
				<ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" />
			</summary>
			<div className="space-y-2 border-t border-border px-3 py-2.5">
				<p className="text-muted-foreground">{t("setupNoticeIntro")}</p>
				<CommandList commands={program.commands} />
			</div>
		</details>
	);
}

export function CommandList({ commands }: { commands: string[] }) {
	return (
		<ul className="space-y-1">
			{commands.map((cmd) => (
				<li
					key={cmd}
					className="break-all rounded bg-muted px-2 py-1 font-mono text-[11px] text-foreground/80"
				>
					{cmd}
				</li>
			))}
		</ul>
	);
}
