import { useSyncExternalStore } from "react";

const STORAGE_KEY = "openportal-github-token";

const listeners = new Set<() => void>();

export function getGithubToken(): string {
	try {
		return localStorage.getItem(STORAGE_KEY) ?? "";
	} catch {
		return "";
	}
}

export function setGithubToken(token: string) {
	const value = token.trim();
	try {
		if (value) localStorage.setItem(STORAGE_KEY, value);
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Storage blocked: the token just won't persist.
	}
	for (const listener of listeners) listener();
}

export function useGithubToken(): string {
	return useSyncExternalStore(
		(cb) => {
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
		getGithubToken,
		() => "",
	);
}

/** Headers for api.github.com, authenticated when the user saved a token. */
export function githubApiHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
	};
	const token = getGithubToken();
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
}

/** Fine-grained token page with name/expiry prefilled; no permissions needed for public repos. */
export const GITHUB_NEW_TOKEN_URL =
	"https://github.com/settings/personal-access-tokens/new?name=OpenPortal&description=Read-only%20access%20to%20public%20repos%20for%20OpenPortal&expires_in=90";
