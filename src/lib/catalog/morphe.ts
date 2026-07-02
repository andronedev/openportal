export const MORPHE_MANIFEST_PUBLIC_KEY =
	"MCowBQYDK2VwAyEAF25wxPAnsn/jKMmFvLx3XC7avoPFSVDML7O1a1/7k7g=";

export const MORPHE_MANIFEST_URLS: string[] = [
	"https://gist.githubusercontent.com/andronedev/196096431f65e92f31f52196bd2ebd34/raw/manifest.signed.json",
];

export function isMorpheConfigured(): boolean {
	return (
		MORPHE_MANIFEST_PUBLIC_KEY.length > 0 && MORPHE_MANIFEST_URLS.length > 0
	);
}

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

interface SignedEnvelope {
	payload: string;
	sig: string;
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
	const binary = atob(b64);
	const bytes = new Uint8Array(new ArrayBuffer(binary.length));
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export async function verifyAndParseManifest(
	envelopeText: string,
): Promise<MorpheManifest> {
	if (!MORPHE_MANIFEST_PUBLIC_KEY) {
		throw new Error("Morphe manifest public key is not configured");
	}

	let envelope: SignedEnvelope;
	try {
		envelope = JSON.parse(envelopeText) as SignedEnvelope;
	} catch {
		throw new Error("Malformed Morphe manifest");
	}
	if (
		typeof envelope.payload !== "string" ||
		typeof envelope.sig !== "string"
	) {
		throw new Error("Malformed Morphe manifest");
	}

	const key = await crypto.subtle.importKey(
		"spki",
		base64ToBytes(MORPHE_MANIFEST_PUBLIC_KEY),
		{ name: "Ed25519" },
		false,
		["verify"],
	);
	const valid = await crypto.subtle.verify(
		{ name: "Ed25519" },
		key,
		base64ToBytes(envelope.sig),
		new TextEncoder().encode(envelope.payload),
	);
	if (!valid) {
		throw new Error("Morphe manifest signature is invalid");
	}

	const json = new TextDecoder().decode(base64ToBytes(envelope.payload));
	return JSON.parse(json) as MorpheManifest;
}
