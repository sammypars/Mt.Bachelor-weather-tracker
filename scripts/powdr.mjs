// Parser for the daily Powdr Forecasts Mt. Bachelor PDF (powdrforecasts.weebly.com/mt-bachelor.html).
// The PDF is a fixed spreadsheet layout, so we read text items with their x/y position and
// assign them to columns by x coordinate.

const TIME_RE = /^\d{1,2}:\d{2}\s?[AP]M$/i;

// Turn pdf.js text content into a flat list of {x, y, s}
export function itemsFromTextContent(tc) {
  return tc.items
    .filter((it) => it.str && it.str.trim())
    .map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str.trim() }));
}

const num = (s) => {
  if (s == null) return null;
  const m = String(s).replace(/[^0-9.\-]/g, "");
  return m === "" || m === "-" ? null : Number(m);
};

function near(items, y, tol = 2.2) {
  return items.filter((it) => Math.abs(it.y - y) <= tol);
}

function pick(row, lo, hi) {
  const hits = row.filter((it) => it.x >= lo && it.x < hi).map((it) => it.s);
  return hits.length ? hits.join(" ") : null;
}

function sectionHeaders(items, re) {
  return items.filter((it) => re.test(it.s)).sort((a, b) => b.y - a.y);
}

function headerFor(headers, y) {
  // nearest header above this row (pdf y grows upward)
  let best = null;
  for (const h of headers) if (h.y > y && (!best || h.y < best.y)) best = h;
  return best;
}

function dateUnder(items, header) {
  // "Date:" row sits just below the section header
  const cand = items
    .filter((it) => it.y < header.y && it.y > header.y - 25 && /\d{4}/.test(it.s) && /day/i.test(it.s))
    .sort((a, b) => b.y - a.y);
  return cand[0]?.s || null;
}

function parseHourlyPage(items, cols, label) {
  const headers = sectionHeaders(items, /^Day-\d Forecast/i);
  const days = headers.map((h) => ({
    title: h.s,
    elevation_ft: num((h.s.match(/([\d,]+)\s*FT/i) || [])[1]),
    date: dateUnder(items, h),
    rows: [],
    liquid_total: null,
    snow_total: null,
    _y: h.y,
  }));
  const times = items.filter((it) => TIME_RE.test(it.s) && it.x < 110).sort((a, b) => b.y - a.y);
  for (const t of times) {
    const h = headerFor(headers, t.y);
    if (!h) continue;
    const day = days.find((d) => d._y === h.y);
    const row = near(items, t.y).filter((it) => it !== t && it.x > 105);
    const rec = { time: t.s.toUpperCase().replace(/\s+/, " ") };
    for (const [key, lo, hi, kind] of cols) {
      const v = pick(row, lo, hi);
      rec[key] = kind === "n" ? num(v) : v;
    }
    day.rows.push(rec);
  }
  // 24-hour totals
  for (const lab of items.filter((it) => /24-Hour Liquid Total/i.test(it.s))) {
    const h = headerFor(headers, lab.y);
    const day = h && days.find((d) => d._y === h.y);
    if (!day) continue;
    const row = near(items, lab.y);
    const snowLab = row.find((it) => /Snow Total/i.test(it.s));
    const liquid = row.filter((it) => it.x > lab.x + 60 && (!snowLab || it.x < snowLab.x) && /\d/.test(it.s));
    const snow = snowLab ? row.filter((it) => it.x > snowLab.x + 60 && /\d/.test(it.s)) : [];
    day.liquid_total = liquid.map((i) => i.s).join(" ") || null;
    day.snow_total = snow.map((i) => i.s).join(" ") || null;
  }
  for (const d of days) {
    delete d._y;
  }
  return { label, days };
}

function parseExtended(items) {
  const head = items.find((it) => /^Highlights$/i.test(it.s));
  if (!head) return null;
  const dayCols = near(items, head.y, 1.5)
    .filter((it) => it.x > head.x + 30)
    .sort((a, b) => a.x - b.x);
  const labels = [
    ["min_temp_f", /Minimum Temp/i, "n"],
    ["max_temp_f", /Maximum Temp/i, "n"],
    ["precip_chance", /Precipitation chance/i, "s"],
    ["precip_amount", /Precipitation amount/i, "s"],
    ["lifted_index", /Lifted Index/i, "n"],
  ];
  const out = dayCols.map((c) => ({ day: c.s }));
  let lowestY = head.y;
  for (const [key, re, kind] of labels) {
    const lab = items.find((it) => re.test(it.s) && it.y < head.y && it.y > head.y - 90 && it.x < head.x + 40);
    if (!lab) continue;
    lowestY = Math.min(lowestY, lab.y);
    const vals = near(items, lab.y).filter((it) => it.x > head.x + 60);
    for (const v of vals) {
      let bi = 0, bd = Infinity;
      dayCols.forEach((c, i) => {
        const d = Math.abs(c.x + 15 - v.x);
        if (d < bd) { bd = d; bi = i; }
      });
      out[bi][key] = kind === "n" ? num(v.s) : v.s;
    }
  }
  return { title: items.find((it) => /Extended Outlook/i.test(it.s))?.s || "Extended Outlook", days: out, _bottom: lowestY };
}

function parseDiscussion(items, belowY) {
  const lines = items
    .filter((it) => it.y < belowY - 5 && it.y > 40 && it.x > 100 && !/JOE NICHOLLS|\d{3}-\d{3}-\d{4}/.test(it.s))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const text = lines.map((l) => l.s).join(" ").replace(/\s+/g, " ").trim();
  return text || null;
}

export function parsePowdr(pages) {
  // pages: array of item arrays (one per PDF page)
  const p1 = pages[0] || [];
  const p2 = pages[1] || [];
  const title = p1.find((it) => /Forecast$/i.test(it.s) && it.y > 690)?.s || "Mount Bachelor Base Forecast";
  const base = parseHourlyPage(
    p1,
    [
      ["temp_f", 100, 135, "n"],
      ["wet_bulb_f", 135, 170, "n"],
      ["rh_pct", 170, 200, "n"],
      ["tstorm_risk", 200, 235, "s"],
      ["precip_amount", 235, 295, "s"],
      ["precip_chance", 295, 335, "s"],
      ["lifted_index", 335, 372, "n"],
      ["wind_dir", 372, 402, "s"],
      ["wind_sus_mph", 402, 426, "n"],
      ["wind_gust_mph", 426, 455, "n"],
      ["sky", 455, 700, "s"],
    ],
    title
  );
  const ext = parseExtended(p1);
  const discussion = parseDiscussion(p1, ext ? ext._bottom : 300);
  if (ext) delete ext._bottom;
  const pageTitle2 = p2.find((it) => /Winds?$/i.test(it.s) && it.y > 690)?.s || "Top of Pine Winds";
  const upper = parseHourlyPage(
    p2,
    [
      ["wind_dir", 150, 205, "s"],
      ["wind_sus_mph", 205, 290, "n"],
      ["wind_gust_mph", 290, 345, "n"],
      ["sky", 345, 700, "s"],
    ],
    pageTitle2
  );
  const forecaster = p1.find((it) => /\d{3}-\d{3}-\d{4}/.test(it.s))?.s || null;
  return { base, upper, extended: ext, discussion, forecaster };
}
