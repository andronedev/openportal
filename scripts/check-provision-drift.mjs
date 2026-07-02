#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const metaPath = join(
	here,
	"..",
	"catalog/apps/immortal-launcher/upstream/meta.json",
);
const meta = JSON.parse(readFileSync(metaPath, "utf8"));

const REF = process.argv[2] || "main";
const token = process.env.GITHUB_TOKEN;
const headers = {
	Accept: "application/vnd.github+json",
	...(token ? { Authorization: `Bearer ${token}` } : {}),
};

async function blobSha(path) {
	const url = `https://api.github.com/repos/${meta.repo}/contents/${path}?ref=${REF}`;
	const res = await fetch(url, { headers });
	if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
	return (await res.json()).sha;
}

async function tryBlobSha(path) {
	const url = `https://api.github.com/repos/${meta.repo}/contents/${path}?ref=${REF}`;
	const res = await fetch(url, { headers });
	return res.ok ? (await res.json()).sha : null;
}

const PROGRAM_PATH = "provisioning/openportal.js";

const files = [
	{
		path: "provisioning/provision.sh",
		vendored: meta.provisionShBlob,
		kind: "procedure",
	},
	{
		path: "provisioning/config.env",
		vendored: meta.configEnvBlob,
		kind: "data",
	},
];

console.log(
	`Immortal provisioning drift: vendored ${meta.vendoredCommitShort} vs ${meta.repo}@${REF}\n`,
);

let procedureDrift = false;
let dataDrift = false;
for (const f of files) {
	const current = await blobSha(f.path);
	if (current === f.vendored) {
		console.log(`  ok    ${f.path} (${current.slice(0, 9)})`);
	} else {
		console.log(
			`  DRIFT ${f.path}\n        vendored ${f.vendored.slice(0, 9)} -> upstream ${current.slice(0, 9)}`,
		);
		if (f.kind === "procedure") procedureDrift = true;
		else dataDrift = true;
	}
}

// The provisioning program is the procedure once Immortal publishes one.
const programUpstream = await tryBlobSha(PROGRAM_PATH);
if (programUpstream) {
	if (meta.programBlob === programUpstream) {
		console.log(`  ok    ${PROGRAM_PATH} (${programUpstream.slice(0, 9)})`);
	} else {
		console.log(
			`  DRIFT ${PROGRAM_PATH}\n        vendored ${meta.programBlob ? meta.programBlob.slice(0, 9) : "(none)"} -> upstream ${programUpstream.slice(0, 9)}`,
		);
		procedureDrift = true;
	}
} else {
	console.log(
		`  n/a   ${PROGRAM_PATH} (not published upstream; using built-in)`,
	);
}
console.log("");

if (procedureDrift) {
	console.log("The procedure changed. Re-review the built-in program in");
	console.log(
		"catalog/apps/immortal-launcher/openportal.js against provision.sh",
	);
	console.log("(and openportal.js if published), then re-vendor with:");
	console.log(`  node scripts/vendor-provision.mjs ${REF}`);
	console.log(
		`Diff: https://github.com/${meta.repo}/commits/${REF}/provisioning`,
	);
	process.exit(1);
}
if (dataDrift) {
	console.log(
		"config.env changed (data only). Runtime already reads release-tag values;",
	);
	console.log("refresh the offline fallback at your convenience with:");
	console.log(`  node scripts/vendor-provision.mjs ${REF}`);
	process.exit(0);
}
console.log("No drift. Vendored snapshot matches upstream.");
