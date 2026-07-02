import { AppCard } from "@/components/apps/AppCard";
import { APP_CATALOG } from "@/lib/catalog";
import { ChevronRight, Package } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

const LAUNCHER = APP_CATALOG.find((a) => a.id === "immortal-launcher");

/**
 * The two actions that matter most to a newcomer, framed as a guided two-step
 * setup: install a launcher, then add apps. Shown on the Classic dashboard.
 */
export function SetupGuide() {
	const { t } = useTranslation("dashboard");

	return (
		<section className="space-y-4">
			<div>
				<h2 className="text-lg font-semibold">{t("setupTitle")}</h2>
				<p className="text-sm text-muted-foreground">{t("setupSubtitle")}</p>
			</div>

			<Step number={1} title={t("step1Title")} description={t("step1Desc")}>
				{LAUNCHER && <AppCard app={LAUNCHER} />}
			</Step>

			<Step
				number={2}
				title={t("step2Title")}
				description={t("step2Desc")}
				last
			>
				<Link
					to="/apps"
					className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/50"
				>
					<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary">
						<Package className="h-6 w-6 text-muted-foreground" />
					</div>
					<div className="min-w-0 flex-1">
						<h4 className="text-sm font-medium">{t("installApps")}</h4>
						<p className="mt-1 text-xs text-muted-foreground">
							{t("installAppsDesc")}
						</p>
					</div>
					<ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
				</Link>
			</Step>
		</section>
	);
}

function Step({
	number,
	title,
	description,
	last,
	children,
}: {
	number: number;
	title: string;
	description: string;
	last?: boolean;
	children: ReactNode;
}) {
	return (
		<div className="flex gap-4">
			<div className="flex flex-col items-center">
				<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
					{number}
				</div>
				{!last && <div className="mt-2 w-px flex-1 bg-border" />}
			</div>
			<div className="min-w-0 flex-1 pb-2">
				<h3 className="text-sm font-medium">{title}</h3>
				<p className="mb-3 mt-0.5 text-xs text-muted-foreground">
					{description}
				</p>
				{children}
			</div>
		</div>
	);
}
