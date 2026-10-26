import { useSyncExternalStore } from "react";

const STORAGE_KEY = "openportal-github-token";
const ACCEPT = "application/vnd.github+json";

const listeners = new Set<() => void>();
let rejected = false;

function notify() {
	for (const listener of listeners) listener();
}

function subscribe(cb: () => void) {
	listeners.add(cb);
	return () => {
		listeners.delete(cb);
	};
}

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
	rejected = false;
	notify();
}

export function useGithubToken(): string {
	return useSyncExternalStore(subscribe, getGithubToken, () => "");
}

export function useGithubTokenRejected(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => rejected,
		() => false,
	);
}

export async function githubApiFetch(url: string): Promise<Response> {
	const token = getGithubToken();
	if (!token || rejected) return fetch(url, { headers: { Accept: ACCEPT } });
	const res = await fetch(url, {
		headers: { Accept: ACCEPT, Authorization: `Bearer ${token}` },
	});
	if (res.status !== 401) return res;
	rejected = true;
	notify();
	return fetch(url, { headers: { Accept: ACCEPT } });
}

/** Fine-grained token page with name/expiry prefilled; no permissions needed for public repos. */
export const GITHUB_NEW_TOKEN_URL =
	"https://github.com/settings/personal-access-tokens/new?name=OpenPortal&description=Read-only%20access%20to%20public%20repos%20for%20OpenPortal&expires_in=90";
