import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	// Set VITE_BASE (e.g. "/openportal/") when deploying under a sub-path,
	// such as a GitHub Pages project site. Defaults to root for custom domains.
	base: process.env.VITE_BASE || "/",
	plugins: [react(), tailwindcss()],
	// The program runtime spawns a module worker (src/lib/programs).
	worker: { format: "es" },
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},
	build: {
		target: "es2022",
		// The core chunk bundles the ya-webadb ADB/WebUSB stack, which is large
		// by nature; advanced tools (scrcpy, etc.) are already split out lazily.
		chunkSizeWarningLimit: 600,
	},
});
