/**
 * dsh-skill-peek — a lightweight sidebar search for the skills this machine loads.
 *
 * Why it exists: the existing skill panels own the *write* surface — enable/disable,
 * create, import, delete. Opening one of them just to answer "what do I have?"
 * costs a heavy panel and a click through four tabs. This plugin answers that one
 * question and nothing else:
 *
 *   - it registers no provider, so the skill catalog the model sees is untouched;
 *   - it exposes no write route, so no SKILL.md is ever modified;
 *   - it stores no state of its own;
 *   - it reads the official root conventions itself and merges the registry,
 *     because the web profile mounts skill-filesystem at the agent-preset
 *     layer and the host plane's ctx.skills.snapshot() alone would miss the
 *     user's own ~/.dsh/skills entries.
 *
 * Source precedence follows the official skill-filesystem conventions: lower rank
 * wins, so the row shown here is the row the model receives.
 *
 * @module dsh-skill-peek
 */
import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const name = "skill-peek";
/** Services this plugin needs before apply runs. */
const inject = ["webServer", "skills", "sessions"];

const ROUTE_PREFIX = "/api/skill-peek";
/** Version shown in the panel subtitle; read once from package.json. */
const PKG_VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
/** Official skill-name grammar (mirrors @deepseek-ai/dsh-skill). */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Source precedence: lower wins. */
const SKILL_RANK = new Map([
	["project-dsh", 100],
	["project-agents", 200],
	["runtime", 250],
	["custom", 300],
	["user-dsh", 400],
	["user-agents", 500],
	["bundled", 600],
]);
/** Display order of the source groups. */
const GROUP_ORDER = [
	"project-dsh",
	"project-agents",
	"custom",
	"runtime",
	"user-dsh",
	"user-agents",
	"bundled",
];
/** Rank of a display level; unknown / foreign sources rank last. */
function rankOf(level) {
	return SKILL_RANK.get(level) ?? 999;
}
/** Map a registry source onto a display level, keeping unknown ones visible. */
function levelOfSource(source) {
	return SKILL_RANK.has(source) ? source : `other:${source}`;
}
/** Write one JSON response. */
function writeJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.statusCode = status;
	res.setHeader("content-type", "application/json; charset=utf-8");
	res.setHeader("cache-control", "no-store");
	res.end(payload);
}
/** Loopback-only fence: this panel serves the local machine's skill catalog. */
function isLoopback(req) {
	const address = req.socket?.remoteAddress ?? "";
	return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
/**
 * Parse the leading YAML frontmatter block without a YAML dependency.
 *
 * Only the fields a skill catalog needs are read; nested maps are skipped and
 * block scalars (`|`, `>`) are folded, which covers every SKILL.md the official
 * providers ship.
 *
 * @param text - whole SKILL.md content.
 * @returns the flat field map plus the markdown body after the frontmatter.
 */
function parseFrontmatter(text) {
	const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(text);
	if (match === null) return { fields: {}, body: text };
	const fields = {};
	const lines = match[1].split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (line === undefined || line.trim() === "" || /^\s/.test(line)) continue;
		const pair = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line);
		if (pair === null) continue;
		const key = pair[1] ?? "";
		let value = (pair[2] ?? "").trim();
		if (value === "|" || value === ">" || value === "|-" || value === ">-" || value === "|+" || value === ">+") {
			const parts = [];
			let cursor = index + 1;
			while (cursor < lines.length) {
				const next = lines[cursor] ?? "";
				if (next.trim() !== "" && !/^\s/.test(next)) break;
				parts.push(next.trim());
				cursor += 1;
			}
			value = value.startsWith("|") ? parts.join("\n").trim() : parts.join(" ").trim();
			index = cursor - 1;
		} else if (value.length >= 2) {
			const first = value[0];
			const last = value[value.length - 1];
			if ((first === '"' && last === '"') || (first === "'" && last === "'")) value = value.slice(1, -1);
		}
		fields[key] = value;
	}
	return { fields, body: text.slice(match[0].length) };
}
/** Read one skill directory (or a bare .md file) under a root. */
async function readSkillAt(root, entry, level) {
	let file;
	if (entry.isDirectory()) file = join(root, entry.name, "SKILL.md");
	else if (entry.isFile() && entry.name.endsWith(".md")) file = join(root, entry.name);
	else return undefined;
	if (!existsSync(file)) return undefined;
	let text;
	try {
		text = await readFile(file, "utf8");
	} catch {
		return undefined;
	}
	const { fields, body } = parseFrontmatter(text);
	const skillName = fields.name ?? "";
	const description = fields.description ?? "";
	if (skillName === "" || description === "" || !SKILL_NAME.test(skillName)) return undefined;
	const whenToUse = fields["when-to-use"] ?? fields.whenToUse ?? "";
	return {
		name: skillName,
		description,
		whenToUse,
		provider: "filesystem",
		level,
		rank: rankOf(level),
		path: file,
		hasContent: true,
		modelInvocable: fields["disable-model-invocation"] !== "true",
		userInvocable: fields["user-invocable"] !== "false",
		bodyLength: body.length,
	};
}
/** Scan one root convention and fold its skills into `into` by rank. */
async function scanRoot(root, level, into) {
	if (!existsSync(root)) return;
	let entries;
	try {
		entries = await readdir(root, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.name === ".system" || entry.name.startsWith(".")) continue;
		const skill = await readSkillAt(root, entry, level);
		if (skill === undefined) continue;
		const existing = into.get(skill.name);
		if (existing !== undefined && existing.rank < skill.rank) continue;
		into.set(skill.name, skill);
	}
}
/** Nearest ancestor holding .git (cwd itself when none). */
function findProjectRoot(cwd) {
	let current = cwd;
	for (;;) {
		if (existsSync(join(current, ".git"))) return current;
		const parent = join(current, "..");
		if (parent === current) return cwd;
		current = parent;
	}
}
/**
 * Collect the whole catalog: filesystem scan plus the registry supplement.
 *
 * @returns the skills (ranked), whether the registry snapshot was complete,
 *   and the roots that were scanned.
 */
async function collect(options) {
	const { cwd, dshHome, agentsHome, customSkillDirs, registry } = options;
	const byName = new Map();
	const projectRoot = findProjectRoot(cwd);
	const roots = [
		[join(projectRoot, ".dsh", "skills"), "project-dsh"],
		[join(projectRoot, ".agents", "skills"), "project-agents"],
		...customSkillDirs.map((dir) => [dir, "custom"]),
		[join(dshHome, "skills"), "user-dsh"],
		[join(agentsHome, "skills"), "user-agents"],
	];
	for (const [root, level] of roots) await scanRoot(root, level, byName);
	let complete = true;
	try {
		const snapshot = await registry.snapshot({ cwd });
		complete = snapshot.complete !== false;
		for (const skill of snapshot.skills ?? []) {
			const level = levelOfSource(skill.source);
			const rank = rankOf(level);
			const existing = byName.get(skill.name);
			if (existing !== undefined && existing.rank < rank) {
				if (existing.whenToUse === "" && skill.whenToUse !== undefined) existing.whenToUse = skill.whenToUse;
				if (skill.provider !== undefined) existing.provider = skill.provider;
				continue;
			}
			byName.set(skill.name, {
				name: skill.name,
				description: skill.description,
				whenToUse: skill.whenToUse ?? "",
				provider: skill.provider ?? level,
				level,
				rank,
				path: existing !== undefined && existing.rank === rank ? existing.path : undefined,
				hasContent: existing !== undefined && existing.rank === rank ? existing.hasContent : false,
				modelInvocable: skill.invocation?.modelInvocable ?? true,
				userInvocable: skill.invocation?.userInvocable ?? true,
			});
		}
	} catch {
		complete = false;
	}
	const skills = [...byName.values()].sort((a, b) => {
		if (a.rank !== b.rank) return a.rank - b.rank;
		if (a.level !== b.level) return a.level < b.level ? -1 : 1;
		return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
	});
	for (const skill of skills) delete skill.rank;
	return { skills, complete, projectRoot, roots: roots.map(([root]) => root) };
}

/** Build the plugin. */
function applyImpl(ctx, config) {
	const dshHome = config?.dshHome ?? process.env.DSH_HOME ?? join(homedir(), ".dsh");
	const agentsHome = config?.agentsHome ?? process.env.DSH_AGENTS_HOME ?? join(homedir(), ".agents");
	const customSkillDirs = Array.isArray(config?.customSkillDirs) ? config.customSkillDirs.filter((dir) => typeof dir === "string" && dir !== "") : [];
	const skillCtx = ctx;

	/** Active session workspaces (degrades to [] when the service is absent). */
	function activeCwds() {
		try {
			const sessions = skillCtx.sessions;
			if (typeof sessions?.list !== "function") return [];
			return sessions
				.list()
				.map((session) => session.header?.cwd)
				.filter((cwd) => typeof cwd === "string" && cwd !== "");
		} catch {
			return [];
		}
	}
	/** The workspace this panel reports on. */
	function currentCwd() {
		return activeCwds()[0] ?? process.cwd();
	}

	const routes = [
		{
			kind: "exact",
			path: `${ROUTE_PREFIX}/list`,
			handler: async (req, res) => {
				if (!isLoopback(req)) {
					writeJson(res, 403, { error: "forbidden: loopback-only" });
					return;
				}
				const cwd = currentCwd();
				try {
					const result = await collect({
						cwd,
						dshHome,
						agentsHome,
						customSkillDirs,
						registry: skillCtx.skills,
					});
					writeJson(res, 200, {
						cwd,
						version: PKG_VERSION,
						generatedAt: new Date().toISOString(),
						complete: result.complete,
						skills: result.skills,
					});
				} catch (error) {
					writeJson(res, 500, { error: `collect failed: ${error instanceof Error ? error.message : String(error)}` });
				}
			},
		},
		{
			kind: "exact",
			path: `${ROUTE_PREFIX}/read`,
			handler: async (req, res) => {
				if (!isLoopback(req)) {
					writeJson(res, 403, { error: "forbidden: loopback-only" });
					return;
				}
				const url = new URL(req.url ?? "/", "http://localhost");
				const skillName = url.searchParams.get("name") ?? "";
				const level = url.searchParams.get("level") ?? "";
				if (!SKILL_NAME.test(skillName)) {
					writeJson(res, 400, { error: "invalid skill name" });
					return;
				}
				const cwd = currentCwd();
				const byName = new Map();
				const projectRoot = findProjectRoot(cwd);
				const roots = [
					[join(projectRoot, ".dsh", "skills"), "project-dsh"],
					[join(projectRoot, ".agents", "skills"), "project-agents"],
					...customSkillDirs.map((dir) => [dir, "custom"]),
					[join(dshHome, "skills"), "user-dsh"],
					[join(agentsHome, "skills"), "user-agents"],
				];
				for (const [root, rootLevel] of roots) await scanRoot(root, rootLevel, byName);
				const skill = byName.get(skillName);
				if (skill === undefined || skill.path === undefined || (level !== "" && skill.level !== level)) {
					writeJson(res, 404, { error: "skill has no readable file" });
					return;
				}
				try {
					const content = await readFile(skill.path, "utf8");
					writeJson(res, 200, { name: skill.name, level: skill.level, path: skill.path, content });
				} catch (error) {
					writeJson(res, 500, { error: `read failed: ${error instanceof Error ? error.message : String(error)}` });
				}
			},
		},
	];

	ctx.effect(() => {
		const disposers = routes.map((route) => ctx.webServer.register(route));
		return () => {
			for (const dispose of disposers) dispose();
		};
	}, "skill-peek: routes");
}

const apply = applyImpl;
/** Internal: the preview data dump reuses the exact collection the panel runs. */
const collectForPreview = collect;
export { apply, collectForPreview, inject, name };
