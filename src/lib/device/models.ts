export type PortalModel =
	| "omni"
	| "portal-2019"
	| "portal-plus-1"
	| "portal-plus-2"
	| "portal-go"
	| "portal-tv"
	| "portal-1"
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
	omni: {
		codename: "omni",
		displayName: "Portal Mini",
		generation: 2,
		screenSize: '8"',
		hasScreen: true,
	},
	aloha: {
		codename: "portal-2019",
		displayName: "Portal (2nd Gen)",
		generation: 2,
		screenSize: '10"',
		hasScreen: true,
	},
	porto: {
		codename: "portal-plus-2",
		displayName: "Portal+ (2nd Gen)",
		generation: 2,
		screenSize: '15.6"',
		hasScreen: true,
	},
	sansa: {
		codename: "portal-go",
		displayName: "Portal Go",
		generation: 2,
		screenSize: '10"',
		hasScreen: true,
	},
	pltv: {
		codename: "portal-tv",
		displayName: "Portal TV",
		generation: 2,
		screenSize: "HDMI",
		hasScreen: false,
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
