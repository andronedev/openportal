import { captureScreen, drawScreenshot } from "@/lib/adb/screen";
import { useActiveAdb, useActivePortalModel } from "@/store/fleet-store";
import { Loader2, Maximize2, RefreshCw, Tablet, Tv } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

type SnapState = "loading" | "ready" | "error";

/**
 * A live snapshot of the device screen, captured once via the ADB framebuffer
 * and framed at the device's real aspect ratio. Doubles as the most reliable
 * source of the actual screen resolution. Clicking it opens the full Screen
 * page so newcomers discover they can mirror and control the device. Falls back
 * to a device-type glyph when the build forbids framebuffer access.
 */
export function DeviceSnapshot() {
	const { t } = useTranslation("dashboard");
	const navigate = useNavigate();
	const adb = useActiveAdb();
	const portalModel = useActivePortalModel();

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [state, setState] = useState<SnapState>("loading");
	const [res, setRes] = useState<{ width: number; height: number } | null>(
		null,
	);

	const capture = useCallback(async () => {
		// No live connection (e.g. demo mode): show the fallback glyph, not a
		// spinner that never resolves.
		if (!adb) {
			setState("error");
			return;
		}
		setState("loading");
		try {
			const shot = await captureScreen(adb);
			const canvas = canvasRef.current;
			if (!canvas) return;
			drawScreenshot(canvas, shot);
			setRes({ width: shot.width, height: shot.height });
			setState("ready");
		} catch {
			setState("error");
		}
	}, [adb]);

	useEffect(() => {
		capture();
	}, [capture]);

	// Real screen ratio once captured; a sensible landscape default beforehand.
	const aspect = res ? res.width / res.height : 16 / 10;
	const FallbackIcon = portalModel?.hasScreen === false ? Tv : Tablet;

	return (
		<div className="flex flex-col items-center gap-2">
			<div
				className="relative w-44 max-w-full sm:w-52"
				style={{ aspectRatio: aspect }}
			>
				<button
					type="button"
					onClick={() => navigate("/screen")}
					title={t("viewScreen")}
					aria-label={t("viewScreen")}
					className="group block h-full w-full overflow-hidden rounded-xl border border-border bg-black shadow-sm"
				>
					<canvas
						ref={canvasRef}
						className={`h-full w-full object-contain transition-opacity ${
							state === "ready" ? "opacity-100" : "opacity-0"
						}`}
					/>

					{state !== "ready" && (
						<span className="absolute inset-0 flex items-center justify-center text-white/50">
							{state === "loading" ? (
								<Loader2 className="h-6 w-6 animate-spin" />
							) : (
								<FallbackIcon className="h-10 w-10" />
							)}
						</span>
					)}

					{/* Reveal-on-hover affordance: the snapshot is a door to the screen. */}
					<span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
						<Maximize2 className="h-6 w-6 text-white" />
					</span>
				</button>

				{state !== "loading" && (
					<button
						type="button"
						onClick={capture}
						title={t("refreshSnapshot")}
						className="absolute right-1.5 top-1.5 rounded-md bg-black/40 p-1.5 text-white/80 backdrop-blur transition-colors hover:bg-black/60 hover:text-white"
					>
						<RefreshCw className="h-3.5 w-3.5" />
					</button>
				)}
			</div>

			{res && (
				<span className="font-mono text-[11px] text-muted-foreground">
					{res.width} × {res.height}
				</span>
			)}
		</div>
	);
}
