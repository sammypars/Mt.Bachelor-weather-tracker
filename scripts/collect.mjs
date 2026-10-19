// Collects data that browsers cannot fetch directly (no CORS) and writes it to /data as JSON.
// Runs on a schedule in GitHub Actions. Each source is independent: if one fails, the
// previous file for that source is kept so the site never goes blank.
//
//   data/mtbachelor.json  Mt. Bachelor's own conditions API (snow report, lifts, trails, forecast, summit station)
//   data/powdr.json       Daily Powdr Forecasts PDF, parsed into tables
//   data/avalanche.json   Central Oregon Avalanche Center danger (avalanche.org)
//   data/lifts.geojson    Lift lines from OpenStreetMap (fetched once, then cached)

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { itemsFromTextContent, parsePowdr } from "./powdr.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const UA = "Mt-Bachelor-Weather-Tracker (github.com/sammypars/Mt.Bachelor-weather-tracker)";
const now = () => new Date().toISOString();

async function get(url, as = "json", opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opts.timeout || 30000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: ctl.signal, ...opts });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    if (as === "json") return await r.json();
    if (as === "text") return await r.text();
    return new Uint8Array(await r.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}

async function save(name, obj) {
  await fs.mkdir(DATA, { recursive: true });
  await fs.writeFile(path.join(DATA, name), JSON.stringify(obj, null, 1) + "\n");
  console.log("wrote", name);
}

async function exists(name) {
  try { await fs.access(path.join(DATA, name)); return true; } catch { return false; }
}

const stripHtml = (h) =>
  (h || "")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .trim();

// ---------- Mt. Bachelor ----------
async function mtBachelor() {
  const API = "https://api.mtbachelor.com/api/v1/";
  const settle = async (p) => { try { return await p; } catch (e) { console.warn("  mtb part failed:", e.message); return null; } };
  const [forecast, reports, alerts, lifts, trails, station] = await Promise.all([
    settle(get(API + "dor/weather-forecast")),
    settle(get(API + "dor/drupal/snow-reports?sort=date&direction=desc")),
    settle(get(API + "dor/drupal/alerts")),
    settle(get(API + "dor/drupal/lifts")),
    settle(get(API + "dor/drupal/trails")),
    settle(get(API + "dor/24-hour-weather")),
  ]);
  if (!forecast && !reports && !station) throw new Error("Mt. Bachelor API unreachable");

  const r = Array.isArray(reports) ? reports[0] : null;
  const snow = r
    ? {
        date: r.date,
        unit: r.unit_of_measurement || "in",
        overnight: r.overnight_amount ?? null,
        new_amount: r.amount ?? null,
        base_depth: r.base_depth ?? null,
        computed: r.computed || {},
        report_text: stripHtml(r.report),
      }
    : null;

  const liftList = Array.isArray(lifts)
    ? lifts.map((l) => ({ name: l.name, status: l.status, type: l.type, sector: l.sector?.name || null, hours: (l.hours || "").trim(), season: l.season, vertical: l.vertical }))
    : [];
  const trailList = Array.isArray(trails) ? trails : [];
  const trailSummary = {
    total: trailList.length,
    winter_total: trailList.filter((t) => t.season === "winter").length,
    winter_open: trailList.filter((t) => t.season === "winter" && t.status === "open").length,
    groomed: trailList.filter((t) => t.season === "winter" && t.status === "open" && /^groomed/i.test(t.groom_status || "")).length,
    open_names: trailList.filter((t) => t.season === "winter" && t.status === "open").map((t) => t.name),
  };

  const n = (v) => (v == null || v === "" ? null : Number(v));
  const stations = {};
  for (const [key, rows] of Object.entries(station || {})) {
    if (!Array.isArray(rows)) continue;
    stations[key] = rows
      .map((s) => ({ t: s.timestamp, temp_f: n(s.temperature), depth: n(s.depth), rh: n(s.rh), wind_avg_mph: n(s.windSpeedAvg), wind_dir: n(s.windDirAvg), wind_max_mph: n(s.windSpeedMax) }))
      .sort((a, b) => (a.t < b.t ? -1 : 1));
  }

  await save("mtbachelor.json", {
    fetched_at: now(),
    source: "https://www.mtbachelor.com/the-mountain/mountain-report/",
    current: forecast?.current || null,
    forecast: forecast?.forecast || [],
    snow_report: snow,
    alerts: (alerts || []).map((a) => ({ title: a.title || a.name, body: stripHtml(a.body || a.message || a.description || ""), level: a.level || a.type || null })),
    lifts: liftList,
    trails: trailSummary,
    stations,
  });
}

// ---------- Powdr Forecasts ----------
async function powdr() {
  const PAGE = "http://powdrforecasts.weebly.com/mt-bachelor.html";
  const html = await get(PAGE, "text");
  const pdfs = [...html.matchAll(/["'](\/?[^"']*?uploads\/[^"']+?\.pdf)["']/gi)].map((m) => m[1]);
  if (!pdfs.length) throw new Error("No PDF found on Powdr page");
  const pdfUrl = new URL(pdfs[0], PAGE).href;
  const imgs = [...new Set([...html.matchAll(/["'](\/?[^"']*?uploads\/[^"']+?\.(?:png|jpe?g|gif))["']/gi)].map((m) => new URL(m[1], PAGE).href))];

  // Skip re-parsing if we already have this exact PDF
  try {
    const prev = JSON.parse(await fs.readFile(path.join(DATA, "powdr.json"), "utf8"));
    if (prev.pdf_url === pdfUrl && prev.base?.days?.length) {
      prev.checked_at = now();
      prev.images = imgs;
      await save("powdr.json", prev);
      return;
    }
  } catch {}

  const bytes = await get(pdfUrl, "bytes");
  const doc = await getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    pages.push(itemsFromTextContent(await page.getTextContent()));
  }
  const parsed = parsePowdr(pages);
  if (!parsed.base.days.length) throw new Error("Powdr PDF parsed with no forecast days (layout change?)");

  // File names look like mtb101826.pdf -> issued 2026-10-18
  const m = pdfUrl.match(/(\d{2})(\d{2})(\d{2})\.pdf$/);
  const issued = m ? `20${m[3]}-${m[1]}-${m[2]}` : null;
  await save("powdr.json", {
    fetched_at: now(),
    checked_at: now(),
    source: PAGE,
    pdf_url: pdfUrl,
    issued,
    images: imgs,
    forecaster: (parsed.forecaster || "").replace(/[\d-]{7,}/g, "").trim() || null,
    base: parsed.base,
    upper: parsed.upper,
    extended: parsed.extended,
    discussion: parsed.discussion,
  });
}

// ---------- Avalanche (COAC) ----------
async function avalanche() {
  const j = await get("https://api.avalanche.org/v2/public/products/map-layer");
  const feats = (j.features || []).filter((f) => /COAC/i.test(f.properties?.center_id || "") || /central oregon/i.test(f.properties?.center || ""));
  await save("avalanche.json", {
    fetched_at: now(),
    source: "https://www.coavalanche.org/",
    zones: feats.map((f) => ({
      name: f.properties.name,
      center: f.properties.center,
      danger: f.properties.danger,
      danger_level: f.properties.danger_level,
      travel_advice: f.properties.travel_advice,
      start_date: f.properties.start_date,
      end_date: f.properties.end_date,
      off_season: f.properties.off_season,
      link: f.properties.link,
      color: f.properties.color,
    })),
  });
}

// ---------- Lift lines from OpenStreetMap (one-time) ----------
async function liftLines() {
  if (await exists("lifts.geojson")) return;
  const q = '[out:json][timeout:60];way["aerialway"](43.95,-121.73,44.02,-121.63);out geom;';
  const mirrors = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
  for (const u of mirrors) {
    try {
      const j = await get(u, "json", { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, timeout: 70000 });
      const features = (j.elements || [])
        .filter((e) => e.geometry && /chair_lift|gondola|mixed_lift|drag_lift|t-bar|platter|magic_carpet|rope_tow/.test(e.tags?.aerialway || ""))
        .map((e) => ({ type: "Feature", properties: { name: e.tags.name || null, kind: e.tags.aerialway }, geometry: { type: "LineString", coordinates: e.geometry.map((g) => [g.lon, g.lat]) } }));
      if (!features.length) throw new Error("no lifts returned");
      await save("lifts.geojson", { type: "FeatureCollection", attribution: "OpenStreetMap contributors", features });
      return;
    } catch (e) {
      console.warn("  overpass mirror failed:", u, e.message);
    }
  }
}

const jobs = { mtBachelor, powdr, avalanche, liftLines };
let failures = 0;
for (const [name, fn] of Object.entries(jobs)) {
  try {
    await fn();
  } catch (e) {
    failures++;
    console.error(`[${name}] failed:`, e.message);
  }
}
await save("status.json", { updated_at: now(), failures });
// Never fail the workflow for a single flaky source; the page shows each source's age.
