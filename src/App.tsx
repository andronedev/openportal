import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/ui/primitives";
import { useTheme } from "@/hooks/use-theme";
import { MOCK_DEVICE_INFO } from "@/lib/adb/mock";
import { resolveModel } from "@/lib/device/models";
import { AppsPage } from "@/pages/AppsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { useDeviceStore } from "@/store/device-store";
import { useUIStore } from "@/store/ui-store";
import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { Toaster } from "sonner";

// The detail page pulls in the markdown renderer; keep it out of the catalog
// bundle. Advanced tools are likewise split — most users never open them.
const AppDetailPage = lazy(() =>
	import("@/pages/AppDetailPage").then((m) => ({ default: m.AppDetailPage })),
);
const FilesPage = lazy(() =>
	import("@/pages/FilesPage").then((m) => ({ default: m.FilesPage })),
);
const ScreenPage = lazy(() =>
	import("@/pages/ScreenPage").then((m) => ({ default: m.ScreenPage })),
);
const TerminalPage = lazy(() =>
	import("@/pages/TerminalPage").then((m) => ({ default: m.TerminalPage })),
);
const LogcatPage = lazy(() =>
	import("@/pages/LogcatPage").then((m) => ({ default: m.LogcatPage })),
);
const FlagsPage = lazy(() =>
	import("@/pages/FlagsPage").then((m) => ({ default: m.FlagsPage })),
);

function useDemoMode() {
	const isDemo = new URLSearchParams(window.location.search).has("demo");
	useEffect(() => {
		if (isDemo) {
			useDeviceStore.setState({
				state: "connected",
				deviceInfo: MOCK_DEVICE_INFO,
				portalModel: resolveModel(MOCK_DEVICE_INFO.codename),
			});
		}
	}, [isDemo]);
	return isDemo;
}

function PageFallback() {
	return (
		<div className="flex h-64 items-center justify-center">
			<Spinner />
		</div>
	);
}

export default function App() {
	const theme = useUIStore((s) => s.theme);
	useTheme();
	useDemoMode();

	return (
		<>
			<Toaster
				richColors
				position="top-right"
				theme={theme === "system" ? "system" : theme}
			/>
			<BrowserRouter basename={import.meta.env.BASE_URL}>
				<Suspense fallback={<PageFallback />}>
					<Routes>
						<Route element={<AppShell />}>
							<Route index element={<DashboardPage />} />
							<Route path="apps" element={<AppsPage />} />
							<Route path="apps/:packageName" element={<AppDetailPage />} />
							<Route path="files" element={<FilesPage />} />
							<Route path="screen" element={<ScreenPage />} />
							<Route path="terminal" element={<TerminalPage />} />
							<Route path="logcat" element={<LogcatPage />} />
							<Route path="flags" element={<FlagsPage />} />
						</Route>
					</Routes>
				</Suspense>
			</BrowserRouter>
		</>
	);
}
