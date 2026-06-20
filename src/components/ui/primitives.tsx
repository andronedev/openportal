import { cn } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export function Card({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div
			className={cn("rounded-xl border border-border bg-card p-6", className)}
		>
			{children}
		</div>
	);
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
			{children}
		</h3>
	);
}

export function PageHeader({
	title,
	description,
	actions,
}: {
	title: string;
	description?: string;
	actions?: React.ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h1 className="text-2xl font-bold">{title}</h1>
				{description && (
					<p className="mt-1 text-sm text-muted-foreground">{description}</p>
				)}
			</div>
			{actions && <div className="flex items-center gap-2">{actions}</div>}
		</div>
	);
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<ButtonVariant, string> = {
	primary: "bg-foreground text-background hover:opacity-90",
	secondary: "bg-secondary text-foreground hover:bg-accent",
	ghost: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
	danger: "bg-red-500/10 text-red-500 hover:bg-red-500/20",
};

export function Button({
	variant = "secondary",
	loading,
	className,
	children,
	disabled,
	...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: ButtonVariant;
	loading?: boolean;
}) {
	return (
		<button
			type="button"
			disabled={disabled || loading}
			className={cn(
				"inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50",
				VARIANTS[variant],
				className,
			)}
			{...props}
		>
			{loading && <Loader2 className="h-4 w-4 animate-spin" />}
			{children}
		</button>
	);
}

export function Spinner({ className }: { className?: string }) {
	return <Loader2 className={cn("h-5 w-5 animate-spin", className)} />;
}

export interface SegmentedOption<T extends string> {
	value: T;
	label: string;
	badge?: number | string;
	dot?: boolean;
}

export function Segmented<T extends string>({
	value,
	onChange,
	options,
	className,
	size = "md",
}: {
	value: T;
	onChange: (value: T) => void;
	options: SegmentedOption<T>[];
	className?: string;
	size?: "sm" | "md";
}) {
	const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
	return (
		<div className={cn("inline-flex rounded-lg bg-secondary p-1", className)}>
			{options.map((opt) => {
				const active = opt.value === value;
				return (
					<button
						key={opt.value}
						type="button"
						onClick={() => onChange(opt.value)}
						className={cn(
							"inline-flex items-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors",
							pad,
							active
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{opt.label}
						{opt.badge !== undefined && opt.badge !== null && (
							<span
								className={cn(
									"rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
									active
										? "bg-secondary text-foreground"
										: "bg-background/60 text-muted-foreground",
								)}
							>
								{opt.badge}
							</span>
						)}
						{opt.dot && (
							<span
								aria-hidden="true"
								className="h-1.5 w-1.5 rounded-full bg-amber-500"
							/>
						)}
					</button>
				);
			})}
		</div>
	);
}

export function EmptyState({
	icon: Icon,
	title,
	description,
	children,
}: {
	icon?: React.ComponentType<{ className?: string }>;
	title: string;
	description?: string;
	children?: React.ReactNode;
}) {
	return (
		<div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
			{Icon && <Icon className="h-8 w-8 text-muted-foreground" />}
			<p className="text-sm font-medium">{title}</p>
			{description && (
				<p className="max-w-sm text-xs text-muted-foreground">{description}</p>
			)}
			{children && <div className="mt-4">{children}</div>}
		</div>
	);
}

export function Modal({
	open,
	onClose,
	title,
	children,
	footer,
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
	footer?: React.ReactNode;
}) {
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [open, onClose]);

	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
			onClick={onClose}
			onKeyDown={() => {}}
			role="presentation"
		>
			<div
				role="dialog"
				aria-modal="true"
				className="flex max-h-[88vh] w-full max-w-md flex-col rounded-xl border border-border bg-card text-foreground shadow-xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => {}}
			>
				<div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
					<h3 className="text-sm font-semibold">{title}</h3>
					<button
						type="button"
						onClick={onClose}
						className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
					>
						<X className="h-4 w-4" />
					</button>
				</div>
				<div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
					{children}
				</div>
				{footer && (
					<div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
						{footer}
					</div>
				)}
			</div>
		</div>
	);
}

export function ConfirmDialog({
	open,
	onClose,
	onConfirm,
	title,
	message,
	confirmLabel,
	danger,
}: {
	open: boolean;
	onClose: () => void;
	onConfirm: () => void;
	title: string;
	message: string;
	confirmLabel?: string;
	danger?: boolean;
}) {
	const { t } = useTranslation();
	return (
		<Modal
			open={open}
			onClose={onClose}
			title={title}
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						{t("cancel")}
					</Button>
					<Button
						variant={danger ? "danger" : "primary"}
						onClick={() => {
							onConfirm();
							onClose();
						}}
					>
						{confirmLabel ?? t("confirm")}
					</Button>
				</>
			}
		>
			<p className="text-muted-foreground">{message}</p>
		</Modal>
	);
}
