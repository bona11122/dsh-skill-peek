/**
 * Dump the preview dataset for the standalone preview page.
 *
 * It runs the plugin's own collector, so the preview shows the same rows,
 * ordering and source grouping the live panel would show — only the registry
 * supplement is empty here (bundled / runtime / manager-injected skills need
 * the running host).
 *
 * Usage: node tools/dump-preview-data.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { collectForPreview } from "../lib/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const cwd = process.cwd();

const result = await collectForPreview({
	cwd,
	dshHome: process.env.DSH_HOME ?? join(homedir(), ".dsh"),
	agentsHome: process.env.DSH_AGENTS_HOME ?? join(homedir(), ".agents"),
	customSkillDirs: [],
	registry: { snapshot: async () => ({ skills: [], complete: true }) },
});

const contents = {};
for (const skill of result.skills) {
	if (skill.path === undefined) continue;
	try {
		const text = await readFile(skill.path, "utf8");
		contents[skill.name] = text.length > 6000 ? `${text.slice(0, 6000)}\n\n…（预览已截断）` : text;
	} catch {
		// A skill whose file vanished between scan and read simply has no body.
	}
}

const payload = {
	generatedAt: new Date().toISOString(),
	cwd,
	complete: result.complete,
	skills: result.skills,
	contents,
};

await writeFile(join(root, "preview", "data.js"), `window.__PEEK_DATA = ${JSON.stringify(payload)};\n`, "utf8");
console.log(`skills=${result.skills.length} withContent=${Object.keys(contents).length} cwd=${cwd}`);
