/**
 * Smoke test for both halves of dsh-skill-peek, with no browser and no DSH host.
 *
 * - host half: apply(ctx) is called with a fake cordis context so the real
 *   routes can be exercised against the real filesystem;
 * - browser half: lib/client.js is loaded under a tiny DOM shim, then
 *   mountPeek() is driven with stub endpoints, checking rows, grouping,
 *   selection, detail rendering and search filtering.
 *
 * Usage: node tools/smoke.mjs
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// host half
// ---------------------------------------------------------------------------
const { apply } = await import(pathToFileURL(join(import.meta.dirname, "..", "lib", "index.js")).href);

const routes = [];
const disposers = [];
const ctx = {
	skills: { snapshot: async () => ({ skills: [], complete: true }) },
	sessions: { list: () => [{ header: { cwd: process.cwd() } }] },
	webServer: {
		register(route) {
			routes.push(route);
			return () => {
				const index = routes.indexOf(route);
				if (index >= 0) routes.splice(index, 1);
			};
		},
	},
	effect(factory) {
		const disposer = factory();
		disposers.push(disposer);
		return () => {
			if (typeof disposer === "function") disposer();
		};
	},
};
apply(ctx, { customSkillDirs: [] });
assert.equal(routes.length, 2, "two routes registered");
assert.equal(disposers.length, 1, "routes wrapped in one effect");

/** Minimal IncomingMessage / ServerResponse stand-ins. */
function callRoute(path, { remoteAddress = "127.0.0.1" } = {}) {
	const route = routes.find((item) => item.path === path.split("?")[0]);
	assert.ok(route, `route ${path} exists`);
	const res = {
		statusCode: 0,
		headers: {},
		body: "",
		setHeader(key, value) {
			this.headers[key] = value;
		},
		end(chunk) {
			this.body = chunk;
		},
	};
	return route
		.handler({ url: path, socket: { remoteAddress } }, res)
		.then(() => ({ status: res.statusCode, json: JSON.parse(res.body || "null") }));
}

const list = await callRoute("/api/skill-peek/list");
assert.equal(list.status, 200, "list is 200");
assert.ok(Array.isArray(list.json.skills), "list carries a skills array");
assert.ok(list.json.skills.length > 0, "list is not empty");
const pkgVersion = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;
assert.equal(list.json.version, pkgVersion, "list exposes the package.json version");
assert.ok(
	list.json.skills.every((skill) => typeof skill.name === "string" && typeof skill.level === "string"),
	"every row carries name + level",
);
const seen = new Set();
for (const skill of list.json.skills) {
	const key = `${skill.level}/${skill.name}`;
	assert.ok(!seen.has(key), `duplicate row ${key}`);
	seen.add(key);
}

const forbidden = await callRoute("/api/skill-peek/list", { remoteAddress: "10.0.0.7" });
assert.equal(forbidden.status, 403, "non-loopback is refused");

const readable = list.json.skills.find((skill) => skill.hasContent);
assert.ok(readable, "at least one skill has a readable file");
const read = await callRoute(`/api/skill-peek/read?name=${encodeURIComponent(readable.name)}&level=${encodeURIComponent(readable.level)}`);
assert.equal(read.status, 200, "read is 200");
assert.ok(read.json.content.includes("---"), "read returns the raw SKILL.md");

const missing = await callRoute("/api/skill-peek/read?name=no-such-skill-here");
assert.equal(missing.status, 404, "unknown skill is 404");

const bad = await callRoute("/api/skill-peek/read?name=Not%20Valid");
assert.equal(bad.status, 400, "invalid name is 400");

// ---------------------------------------------------------------------------
// browser half
// ---------------------------------------------------------------------------
/** One element: enough of the DOM for the renderer, nothing more. */
class FakeElement {
	constructor(tagName, ownerDocument) {
		this.tagName = tagName.toUpperCase();
		this.ownerDocument = ownerDocument;
		this.children = [];
		this.parentNode = null;
		this.dataset = {};
		this.style = {};
		this.listeners = new Map();
		this.className = "";
		this.value = "";
		this._text = "";
	}
	get textContent() {
		if (this.children.length === 0) return this._text;
		return this.children.map((child) => child.textContent).join("");
	}
	set textContent(value) {
		this._text = String(value);
		this.children = [];
	}
	appendChild(node) {
		node.parentNode = this;
		this.children.push(node);
		return node;
	}
	replaceChildren(...nodes) {
		for (const child of this.children) child.parentNode = null;
		this.children = [];
		for (const node of nodes) this.appendChild(node);
	}
	remove() {
		if (this.parentNode === null) return;
		const siblings = this.parentNode.children;
		const index = siblings.indexOf(this);
		if (index >= 0) siblings.splice(index, 1);
		this.parentNode = null;
	}
	append(...nodes) {
		for (const node of nodes) this.appendChild(node);
	}
	setAttribute(key, value) {
		this[key] = value;
	}
	addEventListener(type, handler) {
		this.listeners.set(type, handler);
	}
	dispatch(type, event = {}) {
		const handler = this.listeners.get(type);
		if (handler) handler({ preventDefault() {}, ...event });
	}
	*walk() {
		yield this;
		for (const child of this.children) yield* child.walk();
	}
	find(predicate) {
		for (const node of this.walk()) if (predicate(node)) return node;
		return undefined;
	}
	findAll(predicate) {
		return [...this.walk()].filter(predicate);
	}
}

const doc = {
	head: new FakeElement("head", null),
	createElement(tag) {
		return new FakeElement(tag, doc);
	},
	getElementById() {
		return null;
	},
	listeners: new Map(),
	addEventListener(type, handler) {
		const list = doc.listeners.get(type) ?? [];
		list.push(handler);
		doc.listeners.set(type, list);
	},
	removeEventListener(type, handler) {
		const list = doc.listeners.get(type) ?? [];
		const index = list.indexOf(handler);
		if (index >= 0) list.splice(index, 1);
	},
	dispatch(type, event = {}) {
		for (const handler of [...(doc.listeners.get(type) ?? [])]) handler(event);
	},
};
doc.head.ownerDocument = doc;

globalThis.window = { __ModuleLoader__: { load(definition) { globalThis.__peekDefinition = definition; } } };
globalThis.document = doc;
await readFile(join(import.meta.dirname, "..", "lib", "client.js"), "utf8").then((source) => {
	new Function("window", "document", source)(globalThis.window, doc);
});
const definition = globalThis.__peekDefinition;
assert.equal(definition.id, "dsh-skill-peek", "bundle id");
const client = definition.factory(() => ({}));
assert.equal(typeof client.apply, "function", "apply exported");
assert.deepEqual(client.inject, ["slots"], "client injects slots only");

const container = doc.createElement("div");
const fetchList = async () => ({ cwd: process.cwd(), complete: true, version: list.json.version, skills: list.json.skills });
const fetchRead = async (name, level) =>
	(await callRoute(`/api/skill-peek/read?name=${encodeURIComponent(name)}&level=${encodeURIComponent(level)}`)).json;

const mounted = client.__preview.mountPeek(container, { fetchList, fetchRead });
await new Promise((resolve) => setTimeout(resolve, 60));

const rows = container.findAll((node) => node.className === "spk-row");
assert.equal(rows.length, list.json.skills.length, "one row per skill");
const groups = container.findAll((node) => node.className === "spk-group");
assert.ok(groups.length >= 1, "grouped by source");
const permBadges = container.findAll((node) => node.className === "spk-perm");
assert.equal(permBadges.length, list.json.skills.length * 2, "every row shows model + user permission");
assert.equal(permBadges[0].textContent, "模型", "first badge is the model permission");
assert.equal(permBadges[1].textContent, "用户", "second badge is the user permission");
assert.equal(
	permBadges[0].dataset.on,
	list.json.skills[0].modelInvocable === false ? "false" : "true",
	"model badge reflects modelInvocable",
);
const subtitle = container.find((node) => node.className === "spk-sub");
assert.equal(subtitle.textContent, "检索与查看 · v" + pkgVersion, "subtitle shows the version from package.json");
assert.ok(container.find((node) => node.className === "spk-h2"), "first skill auto-selected");
const pre = container.find((node) => node.className === "spk-pre");
assert.ok(pre && pre.textContent.length > 20, "detail pane shows the SKILL.md body");
assert.ok(!pre.textContent.startsWith("---"), "frontmatter stripped from the viewer");

const search = container.find((node) => node.tagName === "INPUT");
search.value = "zzz-no-match-zzz";
search.dispatch("input");
assert.equal(container.findAll((node) => node.className === "spk-row").length, 0, "search filters rows");
search.dispatch("keydown", { key: "Escape" });
assert.equal(container.findAll((node) => node.className === "spk-row").length, list.json.skills.length, "Escape clears search");

const target = container.findAll((node) => node.className === "spk-row")[3];
target.dispatch("click");
await new Promise((resolve) => setTimeout(resolve, 60));
assert.equal(container.find((node) => node.className === "spk-h2").textContent, target.dataset.key.split("\u0000")[1], "click selects that skill");

const header = container.find((node) => node.className === "spk-group");
assert.equal(header.tagName, "BUTTON", "group header is a button");
assert.equal(header["aria-expanded"], "true", "groups start expanded");
header.dispatch("click");
assert.equal(container.findAll((node) => node.className === "spk-row").length, 0, "collapsing a group hides its rows");
assert.equal(container.find((node) => node.className === "spk-group")["aria-expanded"], "false", "header reports collapsed");
container.find((node) => node.className === "spk-group").dispatch("click");
assert.equal(
	container.findAll((node) => node.className === "spk-row").length,
	list.json.skills.length,
	"expanding restores the rows",
);

search.value = list.json.skills[0].name;
search.dispatch("input");
assert.ok(
	container.findAll((node) => node.className === "spk-group").length >= 1,
	"search keeps headers visible",
);
search.dispatch("keydown", { key: "Escape" });

const splitter = container.find((node) => node.className === "spk-split");
const listPane = container.find((node) => node.className === "spk-pane-list");
assert.ok(splitter && listPane, "splitter sits between the panes");
assert.equal(splitter["aria-valuenow"], "340", "list starts at its default width");
splitter.dispatch("pointerdown", { clientX: 500, button: 0 });
assert.equal(doc.listeners.get("pointermove")?.length ?? 0, 1, "drag tracks pointer moves on the document");
doc.dispatch("pointermove", { clientX: 560 });
assert.equal(listPane.style.width, "400px", "dragging right widens the list");
doc.dispatch("pointerup", {});
assert.equal(doc.listeners.get("pointermove")?.length ?? 0, 0, "drag listeners are removed on pointerup");
splitter.dispatch("pointerdown", { clientX: 0, button: 0 });
doc.dispatch("pointermove", { clientX: 5000 });
assert.equal(listPane.style.width, "680px", "width is clamped to leave the detail room");
doc.dispatch("pointerup", {});
splitter.dispatch("keydown", { key: "ArrowLeft" });
assert.equal(listPane.style.width, "664px", "arrow keys nudge the split");
splitter.dispatch("dblclick");
assert.equal(listPane.style.width, "340px", "double click restores the default");

mounted.dispose();
assert.equal(container.children.length, 0, "dispose removes the panel");

console.log(`host routes: ok · skills: ${list.json.skills.length} · ui rows: ${rows.length} · groups: ${groups.length}`);
console.log("skill-peek smoke test passed");
