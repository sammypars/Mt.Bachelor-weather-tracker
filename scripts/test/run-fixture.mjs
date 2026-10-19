import fs from "node:fs";
import { parsePowdr } from "../powdr.mjs";
const txt = fs.readFileSync(new URL("./fixture-101826.txt", import.meta.url), "utf8");
const pages = [];
for (const line of txt.split("\n")) {
  if (line.startsWith("=== PAGE")) { pages.push([]); continue; }
  const m = line.match(/^(\d+): (.*)$/); if (!m) continue;
  const y = +m[1];
  for (const mm of m[2].matchAll(/(\d+)\|(.*?)(?=\s{2}\d+\||$)/g)) pages.at(-1).push({ x: +mm[1], y, s: mm[2].trim() });
}
const r = parsePowdr(pages);
console.log(JSON.stringify(r, null, 1));
