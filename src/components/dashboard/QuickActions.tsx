import { AppCard } from "@/components/apps/AppCard";
import { APP_CATALOG } from "@/lib/catalog";
import { ChevronRight, Package } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

const LAUNCHER = APP_CATALOG.find((a) => a.id === "immortal-launcher");

export function QuickActions() {
	const { t } = useTranslation("dashboard");

	return (
		<div className="space-y-3">
			<h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
				{t("quickActions")}
			</h3>

			{LAUNCHER && <AppCard app={LAUNCHER} />}

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
		</div>
	);
}
