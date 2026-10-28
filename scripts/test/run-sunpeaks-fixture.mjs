// Checks the Sun Peaks parsers against captured pages: node scripts/test/run-sunpeaks-fixture.mjs
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { parseWeather, parseLifts, parseUpdated } from "../sunpeaks.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const w = parseWeather(await fs.readFile(path.join(dir, "sunpeaks-weather-021426.html"), "utf8"), "2026-02-14");
assert.equal(w.temps.length, 4);
assert.deepEqual(w.temps[0], { name: "Top of the World", elev_m: 2080, temp_c: -7, temp_f: 19 });
assert.equal(w.winds.length, 3);
assert.equal(w.winds[0].dir_deg, 112.5);
assert.equal(w.winds[0].avg_mph, 6);
assert.equal(w.snow.date, "2026-02-14 12:52:00");
assert.equal(w.snow.h24, 9.8);
assert.equal(w.snow.base_alpine, 65.7);
assert.equal(w.forecast.length, 4);
assert.equal(w.forecast[0].date, "2026-02-14");
assert.equal(w.forecast[1].night, true);
assert.equal(w.forecast[3].date, "2026-02-16");
assert.equal(w.forecast[0].high_f, 23);
assert.match(w.discussion, /^SYNOPSIS\n\n/);
assert.match(w.discussion, /EXTENDED OUTLOOK/);
assert.match(w.today, /flurries/);

const l = parseLifts(await fs.readFile(path.join(dir, "sunpeaks-lifts-sample.html"), "utf8"));
assert.deepEqual(l.lifts.map((x) => [x.name, x.status, x.season]), [["Sunburst Express", "closed", "winter"], ["Sundance Express", "open", "winter"]]);
assert.equal(l.lifts[0].hours, "9:30am to 4:00pm");
assert.equal(l.trails.length, 2);
assert.equal(l.trails[1].open && l.trails[1].groomed, true);
assert.match(l.ops, /^Operations Update/);

// a date later than "today" with no year belongs to the previous year
assert.equal(parseUpdated("December 30th at 8:05am", "2026-01-02"), "2025-12-30 08:05:00");
console.log("sunpeaks fixtures ok");
console.log(JSON.stringify({ snow: w.snow, forecast: w.forecast.slice(0, 2), winds: w.winds }, null, 1));
