export const MORPHE_MANIFEST_URLS: string[] = [
	"https://huggingface.co/datasets/hectt98/portal-apps/resolve/main/latest.json",
];

export interface MorpheManifestApp {
	id: string;
	packageName: string;
	version: string;
	arch?: string;
	sha256: string;
	size?: number;
	urls: string[];
}

export interface MorpheManifest {
	version: number;
	generatedAt: string;
	apps: MorpheManifestApp[];
}

export function parseManifest(text: string): MorpheManifest {
	let manifest: MorpheManifest;
	try {
		manifest = JSON.parse(text) as MorpheManifest;
	} catch {
		throw new Error("Malformed Morphe manifest");
	}
	if (!Array.isArray(manifest?.apps)) {
		throw new Error("Malformed Morphe manifest");
	}
	return manifest;
}
