export type PortalModel =
	| "portal-1"
	| "portal-plus-1"
	| "portal-2"
	| "portal-mini"
	| "portal-plus-2"
	| "portal-tv"
	| "portal-go"
	| "unknown";

// Marketing/topology metadata only — anything the device reports itself
// (SoC, Android version, battery/camera presence) is read live in
// `getDeviceInfo` and must not be duplicated here.
export interface PortalModelInfo {
	codename: PortalModel;
	displayName: string;
	generation: 1 | 2;
	screenSize: string;
	hasScreen: boolean;
}

const MODELS: Record<string, PortalModelInfo> = {
	aloha: {
		codename: "portal-1",
		displayName: "Portal (1st Gen)",
		generation: 1,
		screenSize: '10.1"',
		hasScreen: true,
	},
	ohana: {
		codename: "portal-plus-1",
		displayName: "Portal+ (1st Gen)",
		generation: 1,
		screenSize: '15.6"',
		hasScreen: true,
	},
	omni: {
		codename: "portal-2",
		displayName: "Portal (2nd Gen)",
		generation: 2,
		screenSize: '10"',
		hasScreen: true,
	},
	atlas: {
		codename: "portal-mini",
		displayName: "Portal Mini",
		generation: 2,
		screenSize: '8"',
		hasScreen: true,
	},
	cipher: {
		codename: "portal-plus-2",
		displayName: "Portal+ (2nd Gen)",
		generation: 2,
		screenSize: '14"',
		hasScreen: true,
	},
	ripley: {
		codename: "portal-tv",
		displayName: "Portal TV",
		generation: 2,
		screenSize: "HDMI",
		hasScreen: false,
	},
	terry: {
		codename: "portal-go",
		displayName: "Portal Go",
		generation: 2,
		screenSize: '10"',
		hasScreen: true,
	},
};

export function resolveModel(codename: string): PortalModelInfo {
	const model = MODELS[codename];
	if (model) return model;

	for (const info of Object.values(MODELS)) {
		if (
			codename.toLowerCase().includes(info.codename) ||
			info.codename.includes(codename.toLowerCase())
		) {
			return info;
		}
	}

	return {
		codename: "unknown",
		displayName: codename || "Unknown Portal",
		generation: 2,
		screenSize: "Unknown",
		hasScreen: true,
	};
}
