import { Button, Modal } from "@/components/ui/primitives";
import {
	GITHUB_NEW_TOKEN_URL,
	setGithubToken,
	useGithubToken,
	useGithubTokenRejected,
} from "@/lib/github-token";
import { cn } from "@/lib/utils";
import { ExternalLink, KeyRound } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function GithubTokenButton() {
	const { t } = useTranslation();
	const saved = useGithubToken();
	const rejected = useGithubTokenRejected();
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState("");

	const openModal = () => {
		setDraft(saved);
		setOpen(true);
	};

	return (
		<>
			<button
				type="button"
				onClick={openModal}
				title={t("githubToken")}
				aria-label={t("githubToken")}
				className={cn(
					"rounded-md p-1.5 hover:bg-accent hover:text-foreground",
					!saved
						? "text-muted-foreground"
						: rejected
							? "text-amber-500"
							: "text-emerald-500",
				)}
			>
				<KeyRound className="h-4 w-4" />
			</button>
			<Modal
				open={open}
				onClose={() => setOpen(false)}
				title={t("githubToken")}
				footer={
					<>
						{saved && (
							<Button
								variant="danger"
								onClick={() => {
									setGithubToken("");
									setOpen(false);
								}}
							>
								{t("githubTokenClear")}
							</Button>
						)}
						<Button variant="ghost" onClick={() => setOpen(false)}>
							{t("cancel")}
						</Button>
						<Button
							variant="primary"
							onClick={() => {
								setGithubToken(draft);
								setOpen(false);
							}}
						>
							{t("githubTokenSave")}
						</Button>
					</>
				}
			>
				<div className="space-y-3 text-sm">
					<p className="text-muted-foreground">{t("githubTokenBody")}</p>
					{saved && rejected && (
						<p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
							{t("githubTokenRejected")}
						</p>
					)}
					<a
						href={GITHUB_NEW_TOKEN_URL}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1.5 font-medium text-foreground underline underline-offset-2"
					>
						{t("githubTokenCreate")}
						<ExternalLink className="h-3.5 w-3.5" />
					</a>
					<input
						type="password"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						placeholder="github_pat_…"
						autoComplete="off"
						spellCheck={false}
						className="w-full rounded-lg border border-border bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-foreground"
					/>
					<p className="text-xs text-muted-foreground">
						{t("githubTokenPrivacy")}
					</p>
				</div>
			</Modal>
		</>
	);
}
