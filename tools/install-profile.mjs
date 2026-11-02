/**
 * Install dsh-skill-peek into a DSH profile, without a package manager.
 *
 * Why not `dsh plugin add`: the desktop app ships no `dsh` CLI on PATH, and the
 * profile's node_modules is a pnpm store whose install would need the network.
 * So this does exactly what the loader needs:
 *
 *   1. a junction  <profile>/node_modules/dsh-skill-peek -> this directory
 *      (a junction needs no admin rights and stays live: edit here, restart)
 *   2. two entries in <profile>/package.json — `dependencies` and
 *      `dsh.profile.bundles` — after backing the file up next to itself.
 *
 * Usage: node tools/install-profile.mjs [profileDir]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const PACKAGE_NAME = "dsh-skill-peek";
const pluginDir = path.resolve(import.meta.dirname, "..");
const profileDir = path.resolve(process.argv[2] ?? path.join(os.homedir(), ".dsh", "profiles", "desktop"));

function fail(message) {
	console.error("install failed: " + message);
	process.exit(1);
}

const manifestPath = path.join(profileDir, "package.json");
if (!fs.existsSync(manifestPath)) fail(`no package.json in ${profileDir}`);

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.dsh?.profile === undefined) fail("package.json has no dsh.profile block");
const bundles = manifest.dsh.profile.bundles ?? [];
if (!Array.isArray(bundles)) fail("dsh.profile.bundles is not an array");

// 1. junction into node_modules ------------------------------------------------
const linkPath = path.join(profileDir, "node_modules", PACKAGE_NAME);
let existing = null;
try {
	existing = fs.lstatSync(linkPath);
} catch {
	existing = null;
}
if (existing !== null) {
	if (!existing.isSymbolicLink()) fail(`${linkPath} exists and is not a link — remove it by hand first`);
	fs.rmdirSync(linkPath);
	console.log("removed the previous link");
}
fs.mkdirSync(path.join(profileDir, "node_modules"), { recursive: true });
fs.symlinkSync(pluginDir, linkPath, "junction");
console.log("linked " + linkPath + " -> " + pluginDir);

// 2. package.json --------------------------------------------------------------
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${manifestPath}.bak-${stamp}`;
fs.copyFileSync(manifestPath, backup);
console.log("backed up package.json to " + backup);

manifest.dependencies = manifest.dependencies ?? {};
manifest.dependencies[PACKAGE_NAME] = "link:" + pluginDir.replace(/\\/g, "/");
if (!bundles.includes(PACKAGE_NAME)) bundles.push(PACKAGE_NAME);
manifest.dsh.profile.bundles = bundles;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("registered in dependencies + dsh.profile.bundles");

// 3. prove the loader will find it --------------------------------------------
const require = createRequire(manifestPath);
let entry;
try {
	entry = require.resolve(PACKAGE_NAME);
} catch (error) {
	fail("node cannot resolve the package from the profile: " + error.message);
}
console.log("resolves to " + entry);

const hostModule = await import(pathToFileURL(entry).href);
for (const name of ["apply", "inject", "name", "collectForPreview"]) {
	if (hostModule[name] === undefined) fail(`entry does not export ${name}`);
}
console.log("entry exports apply / inject / name / collectForPreview");

console.log("done — quit and reopen DSH to load the panel");
