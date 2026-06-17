import { cn } from "@/lib/utils";

const TONES = {
	emerald: "bg-emerald-500/10 text-emerald-500",
	amber: "bg-amber-500/10 text-amber-500",
	violet: "bg-violet-500/10 text-violet-500",
	sky: "bg-sky-500/10 text-sky-500",
	neutral: "bg-secondary text-muted-foreground",
} as const;

export function AppBadge({
	tone = "neutral",
	title,
	className,
	children,
}: {
	tone?: keyof typeof TONES;
	title?: string;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<span
			title={title}
			className={cn(
				"flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
				TONES[tone],
				className,
			)}
		>
			{children}
		</span>
	);
}
