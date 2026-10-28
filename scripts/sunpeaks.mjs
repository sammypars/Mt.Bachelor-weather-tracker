// Parsers for sunpeaksresort.com. The resort's Drupal site renders everything server-side:
//   /ski-ride/weather-conditions-cams/weather-snow-report  temps, wind, snow totals, 5-day forecast, synopsis
//   /ski-ride/weather-conditions-cams/lifts-trail-status   lift and trail status, operations update
// Values are metric on the page; we convert to the units the rest of the site uses (°F, inches, mph).
// The snow totals, forecast and synopsis are only on the page in winter, so every part is optional.

const ENT = { "&nbsp;": " ", "&amp;": "&", "&#39;": "'", "&rsquo;": "'", "&lsquo;": "'", "&quot;": '"', "&ldquo;": '"', "&rdquo;": '"', "&ndash;": "-", "&mdash;": "-", "&deg;": "°" };
export const text = (h) =>
  String(h || "")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (e) => ENT[e.toLowerCase()] ?? " ")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
const num = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
const cToF = (c) => (c == null ? null : Math.round(c * 9 / 5 + 32));
const cmToIn = (c) => (c == null ? null : Math.round(c / 2.54 * 10) / 10);
const kphToMph = (k) => (k == null ? null : Math.round(k * 0.621371));
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const bearing = (d) => { const i = COMPASS.indexOf(String(d || "").trim().toUpperCase()); return i < 0 ? null : i * 22.5; };
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Section of the page from one id/class marker to the next top-level weather block
function block(html, marker) {
  const i = html.search(marker);
  if (i < 0) return "";
  const rest = html.slice(i);
  const j = rest.slice(20).search(/<div id="[\w-]+" class="[^"]*weather|<div class="weather /);
  return j < 0 ? rest : rest.slice(0, j + 20);
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
// The next date (YYYY-MM-DD, Pacific) on or after `from` that falls on this weekday name
function dateFor(dayName, from) {
  const want = WEEKDAYS.indexOf(String(dayName).toLowerCase().split(/\s+/)[0]);
  if (want < 0) return null;
  const [y, m, d] = from.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12));
  for (let k = 0; k < 7; k++) {
    const t = new Date(base.getTime() + k * 864e5);
    if (t.getUTCDay() === want) return t.toISOString().slice(0, 10);
  }
  return null;
}
export function pacificToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// "February 14th at 12:52pm" -> "2026-02-14 12:52:00" (Pacific local, same format as the other resorts)
export function parseUpdated(s, today) {
  const m = String(s || "").match(/([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\s*(?:at\s*)?(\d{1,2}):(\d{2})\s*([ap])\.?m/i);
  if (!m) return null;
  const mo = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(m[1].toLowerCase());
  if (mo < 0) return null;
  let year = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
  const p = (n) => String(n).padStart(2, "0");
  // No year on the page: a date "later" than today must be from last year
  if (!m[3] && `${year}-${p(mo + 1)}-${p(m[2])}` > today) year--;
  let h = Number(m[4]) % 12; if (/p/i.test(m[6])) h += 12;
  return `${year}-${p(mo + 1)}-${p(m[2])} ${p(h)}:${m[5]}:00`;
}

export function parseWeather(html, today = pacificToday()) {
  const out = { today: null, temps: [], winds: [], snow: null, forecast: [], forecast_text: null, discussion: null };

  out.today = text(html.match(/class="today-description"[^>]*>([\s\S]*?)<\/p>/)?.[1]) || null;

  // Temperatures by elevation
  const temps = block(html, /current-temps|list-temps/);
  for (const m of temps.matchAll(/<h3>([\s\S]*?)<\/h3>[\s\S]*?value_m">([\d,]+)<[\s\S]*?value_deg[^>]*>([\s\S]*?)<\/span>/g)) {
    const c = num(m[3]);
    out.temps.push({ name: text(m[1]), elev_m: num(m[2]), temp_c: c, temp_f: cToF(c) });
  }

  // Wind stations
  const wind = block(html, /id="wind-speeds"/);
  for (const m of wind.matchAll(/<div class="wind">([\s\S]*?)(?=<div class="wind">|$)/g)) {
    const b = m[1];
    const name = text(b.match(/<h3>([\s\S]*?)<\/h3>/)?.[1]);
    if (!name) continue;
    const dir = text(b.match(/Direction<\/h4>[\s\S]*?weather-value">([\s\S]*?)<\/div>/)?.[1]);
    const kph = num(b.match(/value_kph">([^<]*)</)?.[1]);
    out.winds.push({ name, elev_m: num(b.match(/value_m">([\d,]+)</)?.[1]), dir, dir_deg: bearing(dir), avg_kph: kph, avg_mph: kphToMph(kph) });
  }

  // Snow totals (winter only)
  const snow = block(html, /id="snow-conditions"/);
  if (snow) {
    const vals = {};
    for (const m of snow.matchAll(/<h4>([\s\S]*?)<\/h4>[\s\S]*?value_cm[^>]*>([\s\S]*?)<\/span>/g)) {
      const label = text(m[1]).replace(/\*/g, "").trim().toLowerCase();
      if (!(label in vals)) vals[label] = num(m[2]);
    }
    const updatedText = text(snow.match(/class="mice-type"[^>]*>([\s\S]*?)<\/p>/)?.[1]).replace(/^Updated\s*/i, "");
    if (Object.keys(vals).length) {
      out.snow = {
        updated_text: updatedText || null,
        date: parseUpdated(updatedText, today),
        cm: vals,
        new: cmToIn(vals["new snow"]),
        h24: cmToIn(vals["24 hr"]),
        h48: cmToIn(vals["48 hr"]),
        d7: cmToIn(vals["7 days"] ?? vals["7 day"]),
        base_mid: cmToIn(vals["mid mountain"]),
        base_alpine: cmToIn(vals["alpine"]),
        season: cmToIn(vals["season"] ?? vals["season total"] ?? vals["year to date"]),
      };
    }
  }

  // 5-day forecast (winter only): written periods, then day tiles with highs and lows
  const fc = block(html, /id="forecast"/);
  if (fc) {
    out.forecast_text = text(fc.match(/field--name-field-detailed-forecast[^>]*>([\s\S]*?)<\/div>/)?.[1]) || null;
    for (const m of fc.matchAll(/<div class="third">\s*<h4>([\s\S]*?)<\/h4>([\s\S]*?)(?=<div class="third">|<\/div>\s*<h3|$)/g)) {
      const name = text(m[1]);
      const b = m[2];
      const lo = num(b.match(/day_low[\s\S]*?value_deg">([^<]*)</)?.[1]);
      const hi = num(b.match(/day_high[\s\S]*?value_deg">([^<]*)</)?.[1]);
      out.forecast.push({
        name,
        night: /night/i.test(name),
        date: dateFor(name, today),
        description: text(b.match(/day_description">([\s\S]*?)<\/div>/)?.[1]),
        icon: b.match(/day_conditions">\s*<span class="icon-([\w-]+)/)?.[1] || null,
        low_f: cToF(lo),
        high_f: cToF(hi),
      });
    }
    const parts = [];
    for (const m of fc.matchAll(/<h3>([\s\S]*?)<\/h3>\s*<div[^>]*field--name-field-[\w-]+[^>]*>([\s\S]*?)<\/div>/g)) {
      const body = text(m[2]);
      if (body) parts.push(`${text(m[1]).toUpperCase()}\n\n${body}`);
    }
    out.discussion = parts.join("\n\n") || null;
  }
  return out;
}

export function parseLifts(html) {
  const lifts = [];
  const trails = [];
  for (const m of html.matchAll(/<article[^>]*class="([^"]*node-type-(lift|trail)[^"]*)"[^>]*>([\s\S]*?)<\/article>/g)) {
    const cls = m[1];
    const b = m[3];
    const name = text(b.match(/field--name-title[^>]*>([\s\S]*?)<\/span>/)?.[1]);
    if (!name) continue;
    const icon = b.match(/class="row-cell status">[\s\S]*?<span class="(icon-[\w-]+)/)?.[1] || "";
    const groomed = /\bcat-groomed\b/.test(cls) || /groom/i.test(icon);
    const open = /\bcat-126\b/.test(cls) || /icon-open|groom/i.test(icon);
    if (m[2] === "lift") {
      // The site lists summer lifts under a different taxonomy term
      const season = /summer/.test(cls) && !/winter/.test(cls) ? "summer" : "winter";
      lifts.push({ name: name.replace(/\s+Chairlift$/i, ""), status: open ? "open" : "closed", season, hours: text(b.match(/class="notes">([\s\S]*?)<\/span>/)?.[1]).split("\n")[0] || null });
    } else {
      trails.push({ name, open, groomed, zone: cls.match(/\bcat-(tod-mountain|sundance|mt-morrisey|west-bowl|orient-ridge)\b/)?.[1] || null, level: cls.match(/\bcat-(\d-[\w-]+)\b/)?.[1] || null });
    }
  }
  // Operations update (season closures, opening day) sits at the top of the page body
  const body = html.match(/field--name-body[^>]*>([\s\S]*?)<\/div>/)?.[1] || "";
  const upd = body.match(/<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2|$)/);
  const ops = upd ? `${text(upd[1])}\n\n${text(upd[2])}` : null;
  return { lifts, trails, ops: ops && /update|open|clos|season/i.test(ops) ? ops : null };
}

export { cToF, cmToIn, kphToMph, slug };
