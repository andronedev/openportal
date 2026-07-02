/// <reference path="../../../sdk/program-sdk.d.ts" />
//
// Portal Calendar setup, as a first-party OpenPortal program. The app installs
// from GitHub like any other; this program just launches it and surfaces the
// on-device config URL (the calendar's built-in web config server) so the user
// can finish setup from a browser on the same Wi-Fi.

const CONFIG_PORT = 8090;

/** The Portal's LAN IPv4 (prefer Wi-Fi), read from the device shell. */
async function deviceIp(portal) {
	const { stdout } = await portal.shell("ip -o -4 addr show");
	const entries = [];
	for (const line of stdout.split("\n")) {
		const m = /^\d+:\s+(\S+)\s+inet\s+(\d+\.\d+\.\d+\.\d+)/.exec(line.trim());
		if (m && m[1] && m[2] && m[1] !== "lo" && !m[2].startsWith("127.")) {
			entries.push({ iface: m[1], ip: m[2] });
		}
	}
	const wifi = entries.find((e) => e.iface.startsWith("wlan"));
	return wifi?.ip ?? entries[0]?.ip ?? null;
}

export const manifest = {
	apiVersion: 2,
	name: "Portal Calendar",
	steps: ["launch", "address"],
	presentation: {
		intro:
			"Turn your Portal into a wall calendar. You set it up from your browser.",
		steps: [
			"Add your calendars as iCal feeds (Google, iCloud, or any .ics URL) and give each one a color and a name.",
			"Optionally connect iCloud or Google for two-way sync so you can create events from the Portal.",
			'Turn on "Show the calendar when the Portal idles" to use it as a screensaver.',
		],
	},
	fields: [],
};

export function defaultOptions() {
	return {};
}

/** @param {Portal} portal */
export async function provision(portal) {
	const pkg = portal.app.packageName;

	portal.step("launch", "running");
	try {
		await portal.shell(`monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`);
		portal.step("launch", "ok");
	} catch {
		portal.step("launch", "warn");
	}

	portal.step("address", "running");
	const ip = await deviceIp(portal);
	if (!ip) {
		portal.step("address", "error", "No network address");
		throw new Error(
			"Couldn't find the Portal's network address. Make sure it's connected to Wi-Fi.",
		);
	}
	portal.step("address", "ok", ip);

	const url = `http://${ip}:${CONFIG_PORT}`;
	return {
		fleet: null,
		view: {
			text: "Open this address in a browser on the same Wi-Fi as your Portal.",
			links: [{ label: url, url, copy: true }],
		},
	};
}
