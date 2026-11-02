/**
 * Uninstall dsh-skill-peek from a DSH profile: remove the node_modules link and
 * the two package.json entries written by install-profile.mjs. Nothing else in
 * the profile is touched, and the plugin directory itself is left alone.
 *
 * Usage: node tools/uninstall-profile.mjs [profileDir]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PACKAGE_NAME = "dsh-skill-peek";
const profileDir = path.resolve(process.argv[2] ?? path.join(os.homedir(), ".dsh", "profiles", "desktop"));

const manifestPath = path.join(profileDir, "package.json");
if (!fs.existsSync(manifestPath)) {
	console.error("no package.json in " + profileDir);
	process.exit(1);
}

const linkPath = path.join(profileDir, "node_modules", PACKAGE_NAME);
try {
	const stat = fs.lstatSync(linkPath);
	if (stat.isSymbolicLink()) {
		fs.rmdirSync(linkPath);
		console.log("removed link " + linkPath);
	} else {
		console.warn("left alone (not a link): " + linkPath);
	}
} catch {
	console.log("no link to remove");
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.copyFileSync(manifestPath, `${manifestPath}.bak-${stamp}`);

if (manifest.dependencies?.[PACKAGE_NAME] !== undefined) delete manifest.dependencies[PACKAGE_NAME];
const bundles = manifest.dsh?.profile?.bundles;
if (Array.isArray(bundles)) {
	const index = bundles.indexOf(PACKAGE_NAME);
	if (index >= 0) bundles.splice(index, 1);
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("removed the dependency and the bundle entry — restart DSH to drop the panel");
