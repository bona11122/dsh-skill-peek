const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "preview");
const raw = fs.readFileSync(path.join(dir, "data.js"), "utf8");
if (!raw.startsWith("window.__PEEK_DATA = ")) throw new Error("bad data.js prefix");
const data = JSON.parse(raw.slice("window.__PEEK_DATA = ".length).replace(/;\s*$/, ""));
console.log("data.js ok: skills=" + data.skills.length + " contents=" + Object.keys(data.contents).length);

const html = fs.readFileSync(path.join(dir, "preview.html"), "utf8");
const sources = [...html.matchAll(/src="([^"]+)"/g)].map((match) => match[1]);
for (const source of sources) {
  const resolved = path.join(dir, source);
  console.log((fs.existsSync(resolved) ? "ok      " : "MISSING ") + source);
}
if (!html.includes("__PEEK_DATA")) throw new Error("preview does not consume data.js");
if (!html.includes("mountPeek")) throw new Error("preview does not call mountPeek");
console.log("preview.html wiring ok");
