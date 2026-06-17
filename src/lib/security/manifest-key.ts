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
