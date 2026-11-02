/**
 * dsh-skill-peek — browser half.
 *
 * A sidebar row ("技能速览") plus one center-column page that answers a single
 * question: what skills does this machine load? Grouped by source, searchable,
 * with a SKILL.md viewer. It owns no write path: no enable/disable, no create,
 * no import, no delete.
 *
 * The page body is plain DOM (mountPeek) rather than a React tree: the same
 * function drives the real panel inside the web shell and the standalone
 * preview page, so what the preview shows is exactly what the panel renders.
 *
 * Layout note: the root must never be sized by its content. As a flex item its
 * `width` would otherwise be max-content, so a long SKILL.md line would widen
 * the whole panel and slide the list/detail divider around. `flex: 1 1 0` plus
 * `min-width: 0` pins it to the available space instead.
 *
 * @module dsh-skill-peek/client
 */
window.__ModuleLoader__.load({
	id: "dsh-skill-peek",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const react = require("react");

		const PANEL_ID = "skill-peek";
		const PANEL_ORDER = 31;
		const LIST_URL = "/api/skill-peek/list";
		const READ_URL = "/api/skill-peek/read";
		const COLLAPSE_KEY = "dsh-skill-peek:collapsed";
		const LIST_WIDTH_KEY = "dsh-skill-peek:list-width";
		const DEFAULT_LIST_WIDTH = 340;
		const MIN_LIST_WIDTH = 240;
		const MIN_DETAIL_WIDTH = 320;
		const SPLITTER_WIDTH = 6;

		const LEVEL_TITLE = {
			"project-dsh": "项目 · .dsh/skills",
			"project-agents": "项目 · .agents/skills",
			custom: "自定义目录",
			runtime: "运行时注册",
			"user-dsh": "用户 · ~/.dsh/skills",
			"user-agents": "用户 · ~/.agents/skills",
			bundled: "系统内置",
		};

		const CSS = `
.spk-root { box-sizing: border-box; position: relative; display: flex; flex-direction: column; flex: 1 1 0; width: 100%; min-width: 0; min-height: 0; height: 100%; overflow: hidden; color: inherit; }
.spk-root *, .spk-root *::before, .spk-root *::after { box-sizing: border-box; }
.spk-head { flex: none; display: flex; align-items: center; gap: 12px; padding: 12px 18px; border-bottom: 1px solid rgba(128,128,128,.22); }
.spk-title { font-size: 15px; font-weight: 600; display: flex; align-items: baseline; gap: 8px; }
.spk-sub { font-size: 11.5px; font-weight: 400; opacity: .55; }
.spk-stat { margin-left: auto; display: flex; align-items: center; gap: 10px; font-size: 12px; opacity: .62; }
.spk-btn { font: inherit; font-size: 12.5px; padding: 4px 12px; border-radius: 6px; border: 1px solid rgba(128,128,128,.35); background: transparent; color: inherit; cursor: pointer; }
.spk-btn:hover { background: rgba(128,128,128,.12); }
.spk-btn[disabled] { opacity: .5; cursor: default; }
.spk-body { flex: 1 1 0; display: flex; min-width: 0; min-height: 0; overflow: hidden; }
.spk-pane-list { flex: 0 0 340px; width: 340px; min-width: 0; max-width: none; display: flex; flex-direction: column; min-height: 0; }
.spk-split { flex: 0 0 6px; position: relative; cursor: col-resize; touch-action: none; padding: 0; border: 0; background: none; outline: none; }
.spk-split::after { content: ""; position: absolute; top: 0; bottom: 0; left: 2px; width: 1px; background: rgba(128,128,128,.3); transition: width .12s ease, background .12s ease, left .12s ease; }
.spk-split:hover::after, .spk-split:focus-visible::after { left: 2px; width: 2px; background: rgba(128,128,128,.7); }
.spk-root[data-resizing="true"] { user-select: none; }
.spk-root[data-resizing="true"] .spk-split::after { width: 2px; background: rgba(128,128,128,.7); }
.spk-search { flex: none; margin: 12px 12px 8px; }
.spk-search input { width: 100%; font: inherit; font-size: 13px; padding: 6px 10px; border-radius: 7px; border: 1px solid rgba(128,128,128,.32); background: rgba(128,128,128,.06); color: inherit; outline: none; }
.spk-search input:focus { border-color: rgba(128,128,128,.6); }
.spk-rows { flex: 1 1 0; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-gutter: stable; overscroll-behavior: contain; padding-bottom: 16px; }
.spk-group { display: flex; align-items: center; gap: 7px; width: 100%; margin: 0; padding: 14px 14px 5px; font: inherit; font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: inherit; text-align: left; background: none; border: 0; opacity: .8; }
button.spk-group { cursor: pointer; }
button.spk-group:hover { opacity: 1; }
.spk-caret { flex: none; width: 6px; height: 6px; border-bottom: 1.5px solid currentColor; border-right: 1.5px solid currentColor; transform: rotate(45deg); transition: transform .15s ease; }
.spk-group[aria-expanded="false"] .spk-caret { transform: rotate(-45deg); }
.spk-group-title { font-weight: 700; }
.spk-count { margin-left: auto; font-size: 11px; font-weight: 400; letter-spacing: 0; opacity: .65; }
.spk-row { padding: 7px 14px 8px; cursor: pointer; border-left: 2px solid transparent; }
.spk-row:hover { background: rgba(128,128,128,.10); }
.spk-row[data-active="true"] { background: rgba(128,128,128,.16); border-left-color: currentColor; }
.spk-name { display: flex; align-items: center; gap: 6px; font-size: 13.5px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.spk-name span:first-of-type { margin-left: auto; }
.spk-perm { flex: none; font-size: 9.5px; line-height: 1.6; padding: 0 4px; border: 1px solid rgba(128,128,128,.42); border-radius: 3px; font-family: var(--dsw-font-family, system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif); }
.spk-perm[data-on="true"][data-kind="model"] { color: var(--dsw-alias-state-business-primary, #2f7bf6); }
.spk-perm[data-on="true"][data-kind="user"] { color: var(--dsw-alias-state-success-primary, #17a34a); }
.spk-perm[data-on="true"] { border-color: color-mix(in srgb, currentColor 55%, transparent); background: color-mix(in srgb, currentColor 12%, transparent); }
.spk-perm[data-on="false"] { color: var(--dsw-alias-label-tertiary, #8b8b93); border-style: dashed; text-decoration: line-through; opacity: .8; }
.spk-desc { margin-top: 2px; font-size: 12.5px; line-height: 1.45; opacity: .6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spk-pane-detail { flex: 1 1 0; min-width: 0; overflow-y: auto; overflow-x: hidden; scrollbar-gutter: stable; overscroll-behavior: contain; padding: 20px 24px 32px; }
.spk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; height: 100%; font-size: 13px; opacity: .5; text-align: center; padding: 24px; }
.spk-h2 { font-size: 17px; font-weight: 600; margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; word-break: break-all; }
.spk-meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 4px; }
.spk-chip { font-size: 11.5px; line-height: 1.7; padding: 1px 9px; border-radius: 4px; border: 1px solid rgba(128,128,128,.35); opacity: .82; max-width: 100%; overflow-wrap: anywhere; }
.spk-chip[data-warn="true"] { border-color: rgba(214,124,60,.65); opacity: 1; }
.spk-chip[data-mono="true"] { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; }
.spk-section { margin: 18px 0 7px; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; opacity: .55; }
.spk-text { font-size: 13px; line-height: 1.65; opacity: .88; white-space: pre-wrap; overflow-wrap: anywhere; }
.spk-pre { margin: 0; font-size: 13px; line-height: 1.65; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: rgba(128,128,128,.07); border: 1px solid rgba(128,128,128,.2); border-radius: 8px; padding: 14px 16px; max-height: 52vh; overflow: auto; }
.spk-err { font-size: 13px; color: #d9534f; padding: 8px 0; }
.spk-loading { font-size: 13px; opacity: .5; padding: 8px 14px; }
`;

		/** Inject the stylesheet once per document. */
		function ensureStyles(doc) {
			if (doc.getElementById("dsh-skill-peek-css")) return;
			const style = doc.createElement("style");
			style.id = "dsh-skill-peek-css";
			style.textContent = CSS;
			doc.head.appendChild(style);
		}

		/** Create an element with a class and optional text. */
		function el(doc, tag, className, text) {
			const node = doc.createElement(tag);
			if (className) node.className = className;
			if (text !== undefined) node.textContent = text;
			return node;
		}

		/** Localstorage of the host window, if it is reachable at all. */
		function storageOf(doc) {
			try {
				return doc.defaultView?.localStorage ?? null;
			} catch {
				return null;
			}
		}

		/** Collapsed group levels, persisted so the panel reopens the way you left it. */
		function loadCollapsed(storage) {
			if (storage === null) return new Set();
			try {
				const raw = storage.getItem(COLLAPSE_KEY);
				const parsed = raw === null ? [] : JSON.parse(raw);
				return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
			} catch {
				return new Set();
			}
		}

		function saveCollapsed(storage, collapsed) {
			if (storage === null) return;
			try {
				storage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed]));
			} catch {
				/* storage full or blocked — collapsing still works for this session */
			}
		}

		/** Strip the frontmatter block so the viewer shows the instructions. */
		function bodyOf(text) {
			const match = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/.exec(text);
			return match === null ? text : text.slice(match[0].length);
		}

		/** Display title for a level, including foreign `other:` buckets. */
		function titleOf(level) {
			if (LEVEL_TITLE[level] !== undefined) return LEVEL_TITLE[level];
			if (level.indexOf("other:") === 0) return "其他来源 · " + level.slice(6);
			return level;
		}

		/** GET one JSON endpoint, raising a readable error on failure. */
		async function getJson(url) {
			const response = await fetch(url, { headers: { accept: "application/json" } });
			if (!response.ok) throw new Error("HTTP " + response.status);
			return response.json();
		}

		/**
		 * Mount the skill search into a container.
		 *
		 * @param container - host element (the page wrapper or the preview shell).
		 * @param deps - `fetchList` / `fetchRead` overrides (defaults hit the
		 *   plugin's own routes), plus an optional `cwdLabel`.
		 * @returns a disposer that removes every listener and node it created.
		 */
		function mountPeek(container, deps) {
			const doc = container.ownerDocument ?? document;
			ensureStyles(doc);
			const storage = storageOf(doc);
			const fetchList = deps?.fetchList ?? (() => getJson(LIST_URL));
			const fetchRead =
				deps?.fetchRead ??
				((name, level) => getJson(READ_URL + "?name=" + encodeURIComponent(name) + "&level=" + encodeURIComponent(level)));

			const state = {
				skills: [],
				query: "",
				selectedKey: null,
				detail: null,
				loading: true,
				error: null,
				complete: true,
				collapsed: loadCollapsed(storage),
				listWidth: DEFAULT_LIST_WIDTH,
			};
			const root = el(doc, "div", "spk-root");
			const head = el(doc, "div", "spk-head");
			const title = el(doc, "div", "spk-title", "技能速览");
			const sub = el(doc, "span", "spk-sub", "检索与查看");
			if (typeof deps?.version === "string" && deps.version !== "") sub.textContent = "检索与查看 · v" + deps.version;
			title.appendChild(sub);
			const stat = el(doc, "div", "spk-stat");
			head.appendChild(title);
			head.appendChild(stat);

			const body = el(doc, "div", "spk-body");
			const listPane = el(doc, "div", "spk-pane-list");
			const searchWrap = el(doc, "div", "spk-search");
			const input = el(doc, "input");
			input.type = "search";
			input.placeholder = "搜索名称或描述…";
			input.setAttribute("aria-label", "搜索技能");
			searchWrap.appendChild(input);
			const rows = el(doc, "div", "spk-rows");
			listPane.appendChild(searchWrap);
			listPane.appendChild(rows);
			const splitter = el(doc, "div", "spk-split");
			splitter.setAttribute("role", "separator");
			splitter.setAttribute("aria-orientation", "vertical");
			splitter.setAttribute("aria-label", "拖动调整列表宽度");
			splitter.setAttribute("aria-valuemin", String(MIN_LIST_WIDTH));
			splitter.tabIndex = 0;
			splitter.title = "拖动调整宽度，双击恢复默认";
			const detailPane = el(doc, "div", "spk-pane-detail");
			body.appendChild(listPane);
			body.appendChild(splitter);
			body.appendChild(detailPane);
			root.appendChild(head);
			root.appendChild(body);
			container.appendChild(root);

			/** Width the panel currently has to share between the two panes. */
			function availableWidth() {
				const measure = typeof root.getBoundingClientRect === "function" ? root.getBoundingClientRect() : null;
				return measure !== null && measure.width > 0 ? measure.width : 0;
			}

			/** Clamp, apply and (optionally) remember the list width. */
			function setListWidth(width, remember = true) {
				const total = availableWidth();
				const max =
					total > 0 ? Math.max(MIN_LIST_WIDTH, total - MIN_DETAIL_WIDTH - SPLITTER_WIDTH) : DEFAULT_LIST_WIDTH * 2;
				const clamped = Math.max(MIN_LIST_WIDTH, Math.min(Math.round(width), max));
				state.listWidth = clamped;
				listPane.style.flexBasis = clamped + "px";
				listPane.style.width = clamped + "px";
				splitter.setAttribute("aria-valuenow", String(clamped));
				if (remember) {
					try {
						storage?.setItem(LIST_WIDTH_KEY, String(clamped));
					} catch {
						/* storage blocked — the drag still works for this session */
					}
				}
			}

			/** Listen on the document so a drag keeps tracking over the panes. */
			function listenOnDocument(type, handler) {
				if (typeof doc.addEventListener === "function") {
					doc.addEventListener(type, handler);
					return () => doc.removeEventListener(type, handler);
				}
				const view = doc.defaultView;
				if (view !== undefined && view !== null && typeof view.addEventListener === "function") {
					view.addEventListener(type, handler);
					return () => view.removeEventListener(type, handler);
				}
				return () => {};
			}

			splitter.addEventListener("pointerdown", (event) => {
				if (event.button !== undefined && event.button !== 0) return;
				event.preventDefault?.();
				const startX = event.clientX ?? 0;
				const startWidth = state.listWidth;
				root.dataset.resizing = "true";
				const stops = [];
				const stop = () => {
					root.dataset.resizing = "false";
					for (const off of stops) off();
				};
				stops.push(
					listenOnDocument("pointermove", (moveEvent) =>
						setListWidth(startWidth + ((moveEvent.clientX ?? 0) - startX)),
					),
				);
				stops.push(listenOnDocument("pointerup", stop));
				stops.push(listenOnDocument("pointercancel", stop));
			});
			splitter.addEventListener("dblclick", () => setListWidth(DEFAULT_LIST_WIDTH));
			splitter.addEventListener("keydown", (event) => {
				const step = event.shiftKey ? 48 : 16;
				if (event.key === "ArrowLeft") {
					event.preventDefault();
					setListWidth(state.listWidth - step);
				} else if (event.key === "ArrowRight") {
					event.preventDefault();
					setListWidth(state.listWidth + step);
				}
			});

			const rememberedWidth = Number(storage?.getItem(LIST_WIDTH_KEY));
			setListWidth(Number.isFinite(rememberedWidth) && rememberedWidth > 0 ? rememberedWidth : DEFAULT_LIST_WIDTH, false);

			/**
			 * Inline permission badge for a row: solid when that caller may invoke
			 * the skill, dashed + struck through when it may not.
			 */
			function permBadge(label, allowed, kind) {
				const badge = el(doc, "span", "spk-perm", label);
				badge.dataset.kind = kind;
				badge.dataset.on = allowed ? "true" : "false";
				badge.title = label + (allowed ? "可调用" : "不可调用");
				return badge;
			}

			function filtered() {
				const query = state.query.trim().toLowerCase();
				if (query === "") return state.skills;
				return state.skills.filter(
					(skill) =>
						skill.name.toLowerCase().includes(query) || (skill.description ?? "").toLowerCase().includes(query),
				);
			}

			function toggleLevel(level) {
				if (state.collapsed.has(level)) state.collapsed.delete(level);
				else state.collapsed.add(level);
				saveCollapsed(storage, state.collapsed);
				renderRows();
			}

			function renderRows() {
				const scrollTop = rows.scrollTop;
				rows.replaceChildren();
				if (state.loading) {
					rows.appendChild(el(doc, "div", "spk-loading", "读取中…"));
					return;
				}
				if (state.error !== null) {
					rows.appendChild(el(doc, "div", "spk-err", state.error));
					return;
				}
				const visible = filtered();
				if (visible.length === 0) {
					rows.appendChild(el(doc, "div", "spk-empty", state.query === "" ? "没有发现技能" : "没有匹配的技能"));
					return;
				}
				// While searching, groups stay open: collapsing would hide the hit
				// the user just typed a query for.
				const searching = state.query.trim() !== "";
				let currentLevel = null;
				for (const skill of visible) {
					if (skill.level !== currentLevel) {
						currentLevel = skill.level;
						const count = visible.filter((item) => item.level === skill.level).length;
						const collapsed = !searching && state.collapsed.has(skill.level);
						const header = el(doc, searching ? "div" : "button", "spk-group");
						if (!searching) {
							header.type = "button";
							header.setAttribute("aria-expanded", collapsed ? "false" : "true");
							header.title = "展开或折叠这一组";
							header.addEventListener("click", () => toggleLevel(skill.level));
						}
						header.appendChild(el(doc, "span", "spk-caret"));
						header.appendChild(el(doc, "span", "spk-group-title", titleOf(skill.level)));
						header.appendChild(el(doc, "span", "spk-count", String(count)));
						rows.appendChild(header);
					}
					if (!searching && state.collapsed.has(skill.level)) continue;
					const row = el(doc, "div", "spk-row");
					row.setAttribute("role", "button");
					row.tabIndex = 0;
					row.dataset.key = skill.level + "\u0000" + skill.name;
					if (row.dataset.key === state.selectedKey) row.dataset.active = "true";
					const nameLine = el(doc, "div", "spk-name", skill.name);
					nameLine.appendChild(permBadge("模型", skill.modelInvocable !== false, "model"));
					nameLine.appendChild(permBadge("用户", skill.userInvocable !== false, "user"));
					row.appendChild(nameLine);
					row.appendChild(el(doc, "div", "spk-desc", skill.description ?? ""));
					row.addEventListener("click", () => select(skill));
					row.addEventListener("keydown", (event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							select(skill);
						}
					});
					rows.appendChild(row);
				}
				if (typeof scrollTop === "number" && scrollTop > 0) rows.scrollTop = scrollTop;
			}

			function renderStat() {
				stat.replaceChildren();
				if (state.loading) {
					stat.appendChild(el(doc, "span", null, "读取中…"));
				} else if (state.error === null) {
					const visible = state.skills.filter((skill) => skill.modelInvocable !== false).length;
					const levels = new Set(state.skills.map((skill) => skill.level)).size;
					stat.appendChild(el(doc, "span", null, state.skills.length + " 个 · 模型可见 " + visible + " · " + levels + " 组"));
					if (state.complete === false) stat.appendChild(el(doc, "span", null, "部分来源未就绪"));
				}
				const button = el(doc, "button", "spk-btn", "刷新");
				button.type = "button";
				button.disabled = state.loading;
				button.addEventListener("click", () => void load());
				stat.appendChild(button);
			}

			function renderEmptyDetail(message) {
				detailPane.replaceChildren(el(doc, "div", "spk-empty", message));
			}

			function renderDetail() {
				const skill = state.skills.find((item) => item.level + "\u0000" + item.name === state.selectedKey);
				if (skill === undefined) {
					renderEmptyDetail(state.loading ? "读取中…" : "从左侧选择一个技能");
					return;
				}
				const scrollTop = detailPane.scrollTop;
				detailPane.replaceChildren();
				detailPane.appendChild(el(doc, "h2", "spk-h2", skill.name));

				const meta = el(doc, "div", "spk-meta");
				meta.appendChild(el(doc, "span", "spk-chip", titleOf(skill.level)));
				if (skill.provider) meta.appendChild(el(doc, "span", "spk-chip", "provider: " + skill.provider));
				if (skill.modelInvocable === false) {
					const chip = el(doc, "span", "spk-chip", "模型不会自动调用");
					chip.dataset.warn = "true";
					meta.appendChild(chip);
				} else {
					meta.appendChild(el(doc, "span", "spk-chip", "模型可调用"));
				}
				if (skill.userInvocable === false) meta.appendChild(el(doc, "span", "spk-chip", "用户不可调用"));
				if (skill.path) {
					const pathChip = el(doc, "span", "spk-chip", skill.path);
					pathChip.dataset.mono = "true";
					pathChip.title = skill.path;
					meta.appendChild(pathChip);
				}
				detailPane.appendChild(meta);

				detailPane.appendChild(el(doc, "div", "spk-section", "描述"));
				detailPane.appendChild(el(doc, "div", "spk-text", skill.description ?? ""));
				if (skill.whenToUse) {
					detailPane.appendChild(el(doc, "div", "spk-section", "何时使用"));
					detailPane.appendChild(el(doc, "div", "spk-text", skill.whenToUse));
				}

				detailPane.appendChild(el(doc, "div", "spk-section", "SKILL.md"));
				const pre = el(doc, "pre", "spk-pre");
				detailPane.appendChild(pre);
				if (state.detail !== null && state.detail.key === state.selectedKey) {
					pre.textContent =
						state.detail.error !== undefined
							? "读取失败：" + state.detail.error
							: bodyOf(state.detail.content) || "（文件除 frontmatter 外为空）";
				} else if (skill.hasContent === false) {
					pre.textContent = "这个技能由插件在运行时提供，没有可读的 SKILL.md 文件。";
				} else {
					pre.textContent = "读取中…";
				}
				if (typeof scrollTop === "number" && scrollTop > 0) {
					// A new skill starts at the top; the same skill keeps its place
					// when the body arrives a moment later.
					const same = state.detail !== null && state.detail.key === state.selectedKey;
					if (same) detailPane.scrollTop = scrollTop;
				}
			}

			async function select(skill) {
				const key = skill.level + "\u0000" + skill.name;
				if (state.selectedKey === key) return;
				state.selectedKey = key;
				state.detail = null;
				renderRows();
				renderDetail();
				if (skill.hasContent === false) return;
				try {
					const payload = await fetchRead(skill.name, skill.level);
					if (state.selectedKey !== key) return;
					state.detail = { key, content: payload.content ?? "" };
				} catch (error) {
					if (state.selectedKey !== key) return;
					state.detail = { key, content: "", error: error instanceof Error ? error.message : String(error) };
				}
				renderDetail();
			}

			async function load() {
				state.loading = true;
				state.error = null;
				renderStat();
				renderRows();
				try {
					const payload = await fetchList();
					state.skills = Array.isArray(payload.skills) ? payload.skills : [];
					state.complete = payload.complete !== false;
					if (typeof payload.version === "string" && payload.version !== "") {
						sub.textContent = "检索与查看 · v" + payload.version;
					}
					const stillThere = state.skills.some((skill) => skill.level + "\u0000" + skill.name === state.selectedKey);
					if (!stillThere) state.selectedKey = null;
				} catch (error) {
					state.skills = [];
					state.error = "无法读取技能列表：" + (error instanceof Error ? error.message : String(error));
				}
				state.loading = false;
				renderStat();
				renderRows();
				renderDetail();
				const first = state.skills.find((skill) => skill.level + "\u0000" + skill.name === state.selectedKey) ?? state.skills[0];
				if (first !== undefined) await select(first);
			}

			input.addEventListener("input", () => {
				state.query = input.value;
				renderRows();
			});
			input.addEventListener("keydown", (event) => {
				if (event.key === "Escape") {
					input.value = "";
					state.query = "";
					renderRows();
				}
			});

			renderStat();
			renderRows();
			renderEmptyDetail("读取中…");
			void load();

			return {
				reload: () => void load(),
				dispose: () => {
					root.remove();
				},
			};
		}

		/** Sidebar glyph. */
		function SkillPeekIcon({ size }) {
			return react.createElement(
				"svg",
				{
					"data-dsh-panel-entry": PANEL_ID,
					viewBox: "0 0 16 16",
					width: size,
					height: size,
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "1.3",
					strokeLinecap: "round",
					strokeLinejoin: "round",
					"aria-hidden": "true",
				},
				react.createElement("path", { d: "M1.6 8s2.3-4 6.4-4 6.4 4 6.4 4-2.3 4-6.4 4S1.6 8 1.6 8z" }),
				react.createElement("circle", { cx: "8", cy: "8", r: "1.9" }),
			);
		}

		/** Center-column page: a thin React shell around the DOM renderer. */
		function SkillPeekPage() {
			const hostRef = react.useRef(null);
			react.useEffect(() => {
				const mounted = mountPeek(hostRef.current, undefined);
				return () => mounted.dispose();
			}, []);
			return react.createElement("div", {
				ref: hostRef,
				"data-dsh-skill-peek-view": "",
				"data-dsh-plugin": "skill-peek",
				style: { position: "relative", display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden" },
			});
		}

		/** Mount the sidebar row and the page. */
		function apply(ctx) {
			try {
				const slots = ctx.slots;
				ctx.effect(
					() =>
						slots.inject("sidebar.panellist", () =>
							slots.register({ name: "sidebar.panellist", id: PANEL_ID, order: PANEL_ORDER, label: () => "技能速览" }, SkillPeekIcon),
						),
					"skill-peek: sidebar row",
				);
				ctx.effect(
					() => slots.inject("main", () => slots.register({ name: "main", key: PANEL_ID }, SkillPeekPage)),
					"skill-peek: page",
				);
			} catch (error) {
				console.warn("[skill-peek] panel registration failed:", error);
			}
		}

		exports.apply = apply;
		exports.inject = ["slots"];
		/** Preview-only surface: the standalone preview page drives the same renderer. */
		exports.__preview = { mountPeek, PANEL_ID, titleOf };
		return module.exports;
	},
});
