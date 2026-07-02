import { useEffect, useState } from "react";

export interface ReadmeData {
	markdown: string;
	/** Raw directory URL the README lives in, for resolving relative images. */
	baseUrl: string;
}

export type ReadmeState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "error" }
	| { status: "ready"; data: ReadmeData };

const cache = new Map<string, Promise<ReadmeData>>();

function decodeBase64Utf8(b64: string): string {
	const binary = atob(b64.replace(/\n/g, ""));
	const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
	return new TextDecoder("utf-8").decode(bytes);
}

interface GithubReadme {
	content: string;
	download_url: string;
}

/** Fetches a repo's README markdown from the CORS-friendly GitHub API. */
export function fetchReadme(repo: string): Promise<ReadmeData> {
	const cached = cache.get(repo);
	if (cached) return cached;
	const promise = (async () => {
		const res = await fetch(`https://api.github.com/repos/${repo}/readme`, {
			headers: { Accept: "application/vnd.github+json" },
		});
		if (!res.ok) {
			throw new Error(`GitHub API returned ${res.status}`);
		}
		const data = (await res.json()) as GithubReadme;
		return {
			markdown: decodeBase64Utf8(data.content),
			baseUrl: data.download_url.replace(/\/[^/]*$/, "/"),
		};
	})();
	cache.set(repo, promise);
	promise.catch(() => cache.delete(repo));
	return promise;
}

/** Loads the README for an app's `repo`, or stays idle when there is none. */
export function useReadme(repo: string | undefined): ReadmeState {
	const [state, setState] = useState<ReadmeState>(
		repo ? { status: "loading" } : { status: "idle" },
	);
	useEffect(() => {
		if (!repo) {
			setState({ status: "idle" });
			return;
		}
		let cancelled = false;
		setState({ status: "loading" });
		fetchReadme(repo)
			.then((data) => {
				if (!cancelled) setState({ status: "ready", data });
			})
			.catch(() => {
				if (!cancelled) setState({ status: "error" });
			});
		return () => {
			cancelled = true;
		};
	}, [repo]);
	return state;
}
