#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const PKG_PATH = path.resolve(process.cwd(), "package.json");
const MANIFEST_PATH = path.resolve(process.cwd(), "src/manifest.json");

const args = process.argv.slice(2);

if (args.length !== 1) {
	console.error(
		"Usage: node scripts/bump-version.mjs <major|minor|patch|build|X.Y.Z[+build]>",
	);
	process.exit(1);
}

const target = args[0];

const SEMVER_RE =
	/^(\d+)\.(\d+)\.(\d+)(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const raw = fs.readFileSync(PKG_PATH, "utf-8");
const pkg = JSON.parse(raw);
const current = pkg.version;

const m = current.match(SEMVER_RE);
if (!m) {
	console.error(`Invalid current version: ${current}`);
	process.exit(1);
}

const major = Number(m[1]);
const minor = Number(m[2]);
const patch = Number(m[3]);
const build = m[4];

let next;
switch (target) {
	case "major":
		next = `${major + 1}.0.0`;
		if (build) next += `+${build}`;
		break;
	case "minor":
		next = `${major}.${minor + 1}.0`;
		if (build) next += `+${build}`;
		break;
	case "patch":
		next = `${major}.${minor}.${patch + 1}`;
		if (build) next += `+${build}`;
		break;
	case "build": {
		const base = `${major}.${minor}.${patch}`;
		if (build == null) {
			next = `${base}+1`;
		} else if (/^\d+$/.test(build)) {
			next = `${base}+${Number(build) + 1}`;
		} else {
			console.error(
				`Cannot auto-increment non-numeric build metadata: "${build}"`,
			);
			process.exit(1);
		}
		break;
	}
	default:
		if (!SEMVER_RE.test(target)) {
			console.error(`Invalid version: ${target}`);
			process.exit(1);
		}
		next = target;
}

const indent = raw.match(/\n([ \t]+)"/)?.[1] ?? "  ";
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

pkg.version = next;
fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, indent) + eol);

const raw_manifest = fs.readFileSync(MANIFEST_PATH, "utf-8");
const json_manifest = JSON.parse(raw_manifest);
json_manifest.version = next;
fs.writeFileSync(
	MANIFEST_PATH,
	JSON.stringify(json_manifest, null, indent) + eol,
);

console.log(`Version bumped: ${current} -> ${next}`);
