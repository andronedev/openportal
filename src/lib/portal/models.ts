export type PortalModel =
	| "omni"
	| "portal-1"
	| "portal-plus-1"
	| "portal-2019"
	| "portal-plus-2"
	| "portal-go"
	| "portal-tv"
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

/**
 * Map of internal device codenames (from `ro.product.device`) to Portal model
 * metadata. Gen 1 devices use the Google ADB VID (0x18d1) while Gen 2+
 * devices use Meta's own VID (0x2ec6).
 */
const MODELS: Record<string, PortalModelInfo> = {
	// ── Gen 1 ────────────────────────────────────────────────────────────
	aloha: {
		codename: "portal-1",
		displayName: "Portal (1st Gen)",
		generation: 1,
		screenSize: '10.1"',
		hasScreen: true,
	},
	portopalma: {
		codename: "portal-plus-1",
		displayName: "Portal+ (1st Gen)",
		generation: 1,
		screenSize: '15.6"',
		hasScreen: true,
	},

	// ── Gen 2 ────────────────────────────────────────────────────────────
	omni: {
		codename: "omni",
		displayName: "Portal Mini",
		generation: 2,
		screenSize: '8"',
		hasScreen: true,
	},
	"aloha-2": {
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
