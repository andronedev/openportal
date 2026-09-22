import {
	AndroidKeyCode,
	AndroidMotionEventAction,
	type ScrcpySession,
	isScrcpySupported,
	startScrcpy,
} from "@/lib/adb/scrcpy";
import { canvasToPngBlob } from "@/lib/adb/screen";
import { cn } from "@/lib/utils";
import { downloadBlob } from "@/lib/utils/download";
import { useActiveAdb } from "@/store/fleet-store";
import {
	Camera,
	CornerDownLeft,
	Delete,
	Keyboard,
	Loader2,
	Maximize,
	Minimize,
	RotateCw,
	SendHorizontal,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type Status = "idle" | "starting" | "active" | "error";

export function ScreenMirror({
	autoStart = false,
	textInput = false,
	onClose,
	className,
}: {
	autoStart?: boolean;
	/** Show a bar to type text directly onto the device. */
	textInput?: boolean;
	onClose?: () => void;
	className?: string;
}) {
	const { t } = useTranslation("tools");
	const adb = useActiveAdb();
	const [status, setStatus] = useState<Status>("idle");
	const [error, setError] = useState<string | null>(null);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [hasControl, setHasControl] = useState(false);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const sessionRef = useRef<ScrcpySession | null>(null);
	const busyRef = useRef(false);
	const pointerDownRef = useRef(false);

	const supported = isScrcpySupported();

	const start = useCallback(async () => {
		if (!adb || !canvasRef.current || busyRef.current || sessionRef.current) {
			return;
		}
		busyRef.current = true;
		setStatus("starting");
		setError(null);
		try {
			sessionRef.current = await startScrcpy(
				adb,
				canvasRef.current,
				`${import.meta.env.BASE_URL}scrcpy-server`,
			);
			setHasControl(sessionRef.current.hasControl);
			setStatus("active");
		} catch (err) {
			setStatus("error");
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			busyRef.current = false;
		}
	}, [adb]);

	const stop = useCallback(async () => {
		const session = sessionRef.current;
		sessionRef.current = null;
		setHasControl(false);
		setStatus("idle");
		if (session) await session.stop().catch(() => {});
	}, []);

	useEffect(() => {
		if (autoStart && adb && supported) start();
		return () => {
			sessionRef.current?.stop().catch(() => {});
			sessionRef.current = null;
		};
	}, [autoStart, adb, supported, start]);

	useEffect(() => {
		const handler = () =>
			setIsFullscreen(document.fullscreenElement === containerRef.current);
		document.addEventListener("fullscreenchange", handler);
		return () => document.removeEventListener("fullscreenchange", handler);
	}, []);

	const toggleFullscreen = () => {
		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => {});
		} else {
			containerRef.current?.requestFullscreen().catch(() => {});
		}
	};

	const handleScreenshot = async () => {
		if (!canvasRef.current || status !== "active") return;
		try {
			const blob = await canvasToPngBlob(canvasRef.current);
			const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
			downloadBlob(blob, `portal-${stamp}.png`, "image/png");
		} catch (err) {
			toast.error(t("screen.error"), {
				description: err instanceof Error ? err.message : undefined,
			});
		}
	};

	const handleClose = async () => {
		await stop();
		onClose?.();
	};

	const normalized = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		return {
			nx: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
			ny: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
		};
	};

	const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
		if (!sessionRef.current) return;
		pointerDownRef.current = true;
		e.currentTarget.setPointerCapture(e.pointerId);
		const { nx, ny } = normalized(e);
		void sessionRef.current.injectTouch(AndroidMotionEventAction.Down, nx, ny);
	};

	const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
		if (!sessionRef.current || !pointerDownRef.current) return;
		const { nx, ny } = normalized(e);
		void sessionRef.current.injectTouch(AndroidMotionEventAction.Move, nx, ny);
	};

	const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
		if (!sessionRef.current || !pointerDownRef.current) return;
		pointerDownRef.current = false;
		const { nx, ny } = normalized(e);
		void sessionRef.current.injectTouch(AndroidMotionEventAction.Up, nx, ny);
	};

	const sendText = (text: string) => {
		void sessionRef.current?.injectText(text);
	};

	const pressKey = (keyCode: AndroidKeyCode) => {
		void sessionRef.current?.pressKey(keyCode);
	};

	// Friendly fallbacks (no crash in demo mode or unsupported browsers).
	if (!supported || !adb) {
		return (
			<div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
				<span>
					{!supported ? t("screen.unsupported") : t("screen.demoUnavailable")}
				</span>
				{onClose && (
					<button
						type="button"
						onClick={onClose}
						className="rounded-md p-1 hover:bg-accent hover:text-foreground"
						aria-label={t("screen.close")}
					>
						<X className="h-4 w-4" />
					</button>
				)}
			</div>
		);
	}

	return (
		<div className={cn("space-y-2", className)}>
			<div
				ref={containerRef}
				className={cn(
					"group relative flex items-center justify-center overflow-hidden rounded-xl border border-border bg-black",
					!isFullscreen && "max-h-[70vh]",
				)}
			>
				<canvas
					ref={canvasRef}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					className={cn(
						"max-h-[70vh] max-w-full",
						isFullscreen && "max-h-screen",
						status === "active" ? "cursor-pointer touch-none" : "hidden",
					)}
				/>

				{status !== "active" && (
					<div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-sm text-muted-foreground">
						{status === "starting" ? (
							<>
								<Loader2 className="h-6 w-6 animate-spin" />
								<span>{t("screen.starting")}</span>
							</>
						) : status === "error" ? (
							<>
								<span className="text-red-400">{t("screen.error")}</span>
								{error && <span className="max-w-sm text-xs">{error}</span>}
								<button
									type="button"
									onClick={start}
									className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-foreground hover:bg-accent"
								>
									<RotateCw className="h-3.5 w-3.5" />
									{t("screen.retry")}
								</button>
							</>
						) : (
							<button
								type="button"
								onClick={start}
								className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 font-medium text-background hover:opacity-90"
							>
								{t("screen.show")}
							</button>
						)}
					</div>
				)}

				{/* Floating controls */}
				<div className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-black/40 p-1 opacity-70 backdrop-blur transition-opacity group-hover:opacity-100">
					{status === "active" && (
						<>
							<ControlButton
								title={t("screen.screenshot")}
								onClick={handleScreenshot}
							>
								<Camera className="h-4 w-4" />
							</ControlButton>
							<ControlButton
								title={t("screen.fullscreen")}
								onClick={toggleFullscreen}
							>
								{isFullscreen ? (
									<Minimize className="h-4 w-4" />
								) : (
									<Maximize className="h-4 w-4" />
								)}
							</ControlButton>
						</>
					)}
					{onClose && (
						<ControlButton title={t("screen.close")} onClick={handleClose}>
							<X className="h-4 w-4" />
						</ControlButton>
					)}
				</div>
			</div>

			{textInput && status === "active" && hasControl && (
				<TextInputBar
					onSendText={sendText}
					onPressEnter={() => pressKey(AndroidKeyCode.Enter)}
					onBackspace={() => pressKey(AndroidKeyCode.Backspace)}
				/>
			)}
		</div>
	);
}

function TextInputBar({
	onSendText,
	onPressEnter,
	onBackspace,
}: {
	onSendText: (text: string) => void;
	onPressEnter: () => void;
	onBackspace: () => void;
}) {
	const { t } = useTranslation("tools");
	const [text, setText] = useState("");

	const send = () => {
		if (!text) return;
		onSendText(text);
		setText("");
	};

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				send();
			}}
			className="flex items-center gap-1 rounded-xl border border-border bg-card px-2 py-1.5"
		>
			<Keyboard
				className="ml-0.5 h-4 w-4 shrink-0 text-muted-foreground"
				aria-hidden
			/>
			<input
				value={text}
				onChange={(e) => setText(e.target.value)}
				placeholder={t("screen.typePlaceholder")}
				title={t("screen.typeHint")}
				autoCapitalize="off"
				autoCorrect="off"
				autoComplete="off"
				spellCheck={false}
				className="min-w-0 flex-1 bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
			/>
			<InputBarButton title={t("screen.backspace")} onClick={onBackspace}>
				<Delete className="h-4 w-4" />
			</InputBarButton>
			<InputBarButton title={t("screen.enter")} onClick={onPressEnter}>
				<CornerDownLeft className="h-4 w-4" />
			</InputBarButton>
			<button
				type="submit"
				title={t("screen.send")}
				disabled={!text}
				className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
			>
				<SendHorizontal className="h-4 w-4" />
			</button>
		</form>
	);
}

function InputBarButton({
	title,
	onClick,
	children,
}: {
	title: string;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			title={title}
			onClick={onClick}
			className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
		>
			{children}
		</button>
	);
}

function ControlButton({
	title,
	onClick,
	children,
}: {
	title: string;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			title={title}
			onClick={onClick}
			className="rounded-md p-1.5 text-white/90 transition-colors hover:bg-white/20 hover:text-white"
		>
			{children}
		</button>
	);
}
