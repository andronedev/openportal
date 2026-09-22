import { FitAddon } from "@xterm/addon-fit";
import { Terminal as Xterm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { ConnectGate } from "@/components/connection/ConnectGate";
import { PageHeader } from "@/components/ui/primitives";
import { type PtyHandle, openPty } from "@/lib/adb/pty";
import { useActiveAdb } from "@/store/fleet-store";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export function TerminalPage() {
	const { t } = useTranslation("tools");
	const adb = useActiveAdb();
	const containerRef = useRef<HTMLDivElement>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!adb || !container) return;

		let disposed = false;
		let pty: PtyHandle | null = null;

		const term = new Xterm({
			cursorBlink: true,
			fontSize: 13,
			fontFamily:
				'"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
			theme: {
				background: "#0a0a0a",
				foreground: "#e5e5e5",
				cursor: "#e5e5e5",
			},
		});
		const fit = new FitAddon();
		term.loadAddon(fit);
		term.open(container);

		const safeFit = () => {
			try {
				fit.fit();
			} catch {
				// container not laid out yet
			}
		};
		safeFit();

		openPty(adb, (chunk) => term.write(chunk), {
			rows: term.rows,
			cols: term.cols,
		})
			.then((handle) => {
				if (disposed) {
					handle.kill();
					return;
				}
				pty = handle;
				term.onData((data) => handle.write(data));
				term.onResize(({ rows, cols }) => handle.resize(rows, cols));
				handle.exited.then(() => {
					if (!disposed) {
						term.write(`\r\n\x1b[90m${t("terminal.sessionEnded")}\x1b[0m\r\n`);
					}
				});
				term.focus();
			})
			.catch((err: unknown) => {
				setError(
					err instanceof Error ? err.message : t("terminal.unsupported"),
				);
			});

		const observer = new ResizeObserver(() => safeFit());
		observer.observe(container);

		return () => {
			disposed = true;
			observer.disconnect();
			pty?.kill();
			term.dispose();
		};
	}, [adb, t]);

	return (
		<div className="mx-auto flex h-full max-w-4xl flex-col space-y-6">
			<PageHeader title={t("terminal.title")} />

			{error && (
				<div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
					{error}
				</div>
			)}

			<ConnectGate>
				<div
					ref={containerRef}
					className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-black p-2"
				/>
			</ConnectGate>
		</div>
	);
}
