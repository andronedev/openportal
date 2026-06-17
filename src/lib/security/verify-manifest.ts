import { MORPHE_MANIFEST_PUBLIC_KEY } from "./manifest-key";

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
