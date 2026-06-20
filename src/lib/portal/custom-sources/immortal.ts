import type { ResolvedApk } from "../sources";

const VERSION_JSON =
	"https://raw.githubusercontent.com/starbrightlab/immortal/main/version.json";

interface ImmortalVersion {
	versionName?: string;
	versionCode?: number;
	apkUrl?: string;
}

// Immortal publishes its own version manifest; its release tags drift from the
// APK's embedded versionName, so trust this instead of GitHub-release inference.
export async function resolveImmortal(): Promise<ResolvedApk> {
	const res = await fetch(VERSION_JSON, {
		headers: { Accept: "application/json" },
	});
	if (!res.ok) {
		throw new Error(`Immortal version.json returned ${res.status}`);
	}
	const data = (await res.json()) as ImmortalVersion;
	if (!data.versionName || !data.apkUrl) {
		throw new Error("Immortal version.json is missing versionName or apkUrl");
	}
	return {
		version: data.versionName.replace(/^v/i, ""),
		versionCode:
			typeof data.versionCode === "number" ? data.versionCode : undefined,
		url: data.apkUrl,
		urls: [data.apkUrl],
	};
}
