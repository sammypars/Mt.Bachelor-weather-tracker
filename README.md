# Mt. Bachelor Weather Tracker

One page for Mt. Bachelor, Willamette Pass and Sun Peaks ski weather. A big switch at the top flips the whole page between the three mountains (or link straight to one with `?mtn=willamette` or `?mtn=sunpeaks`; keys 1, 2 and 3 also switch). For Mt. Bachelor it shows summit, mid-mountain and base forecasts, new snow totals, summit wind, freezing level, the resort's snow report and lift status, the daily Powdr Forecasts report, NOAA forecasts, alerts and forecaster discussion, on-mountain weather stations, an interactive map, and live webcams.

Live site: https://sammypars.github.io/Mt.Bachelor-weather-tracker/

## What is on the page

- **At a glance**: new snow next 24/48/72 hours and 7 days, summit wind with compass, a temperature-by-elevation graphic with the freezing level, and the official Mt. Bachelor snow report.
- **Mountain status**: lifts and trails open, grooming, Central Oregon Avalanche Center danger, and the full mountain report.
- **7-day outlook, every source**: NOAA, Mt. Bachelor, Powdr Forecasts and the Open-Meteo model side by side for each day, with a note on how closely they agree.
- **Powdr Forecasts**: the daily PDF parsed into readable tables (base temps, wet bulb, precip, wind at 6,300 and 7,800 ft), the extended outlook and the forecaster discussion.
- **Next 72 hours**: chart of temperature at three elevations, summit snowfall with precip chance, or wind and gusts, plus an hour-by-hour strip.
- **Mountain map**: terrain, satellite or street base maps with animated wind, a new-snow accumulation layer, precipitation and temperature (with the 32 degree line), a 72-hour time slider with playback, live NOAA NEXRAD radar loop, lift lines and real station readings.
- **NOAA forecast**: NWS Pendleton point forecast for the summit and the Area Forecast Discussion.
- **Weather stations and webcams**: Mt. Bachelor's on-mountain stations with 24-hour trends, nine resort webcams, and ODOT TripCheck road cams on Century Drive, US 97 (Bend and Lava Butte) and US 20 at Santiam Pass.

### Willamette Pass

The same forecast, chart, map, NOAA and alert sections, pointed at Eagle Peak (6,683 ft) with the NWS Portland forecast. The resort's snow report, lift and trail status come from willamettepass.ski. Webcams are the resort's two live YouTube streams (base area and the top of the Eagle Peak Accelerator) plus TripCheck cams on Highway 58 at the pass, Salt Creek Tunnel and Oakridge, and US 97 at Crescent. Powdr Forecasts, the avalanche center and on-mountain stations are Mt. Bachelor only, so those sections hide.

### Sun Peaks

Sun Peaks Resort in British Columbia, with forecasts for the village (4,117 ft), mid-mountain (6,086 ft) and Top of the World (6,824 ft). The US sources don't reach Canada, so each one has a Canadian stand-in:

- **Forecast and warnings**: Environment and Climate Change Canada. The nearest city forecast is Kamloops, in the valley about 45 km southwest, so it is shown in the outlook but left out of the "sources agree" check. Snow level comes from the same forecast.
- **Forecaster discussion**: the resort forecaster's synopsis and extended outlook, posted in winter.
- **Radar**: Environment Canada's 1 km radar composite (GeoMet), last hour in 6-minute frames.
- **Avalanche**: Avalanche Canada's forecast for the point (daily ratings start in late November).
- **Snow report, lifts, trails, resort forecast and on-mountain readings**: sunpeaksresort.com, collected hourly. The resort only shows current readings, so the collector keeps the last 24 hours to draw station trends.
- **Webcams**: the resort's six cams plus DriveBC highway cams in Kamloops and Barriere.

The parser is `scripts/sunpeaks.mjs`; its test is `node scripts/test/run-sunpeaks-fixture.mjs`, against a captured copy of the February 14, 2026 winter layout.

## How the data works

Some sources can be read directly by the browser; others block cross-site requests, so a GitHub Action collects them every hour into `data/`.

| Source | How it loads |
| --- | --- |
| Open-Meteo forecasts (points and map grid) | Live in the browser |
| NOAA / National Weather Service (forecast, grid data, alerts, discussion) | Live in the browser |
| NOAA NEXRAD radar (via Iowa Environmental Mesonet tiles) | Live in the browser |
| Mt. Bachelor conditions API (snow report, lifts, trails, forecast, stations) | `data/mtbachelor.json`, hourly Action |
| Powdr Forecasts daily PDF (powdrforecasts.weebly.com/mt-bachelor.html) | `data/powdr.json`, hourly check, parsed when a new PDF is posted |
| Central Oregon Avalanche Center (avalanche.org) | `data/avalanche.json`, hourly Action |
| Willamette Pass snow report, lifts, trails, webcam list (willamettepass.ski) | `data/willamette.json`, hourly Action |
| Sun Peaks snow report, lifts, trails, resort forecast, station readings (sunpeaksresort.com) | `data/sunpeaks.json`, hourly Action |
| Environment Canada forecast, warnings and GeoMet radar | Live in the browser |
| Avalanche Canada point forecast | Live in the browser |
| DriveBC highway cams | Live in the browser |
| ODOT TripCheck road cams | Live in the browser |
| Lift lines (OpenStreetMap) | `data/lifts.geojson`, `data/lifts-willamette.geojson` and `data/lifts-sunpeaks.geojson`, fetched once |

The collector is `scripts/collect.mjs` and the Powdr PDF parser is `scripts/powdr.mjs`. Run it locally with `npm ci && node scripts/collect.mjs`. The workflow is `.github/workflows/update-data.yml`; you can also start it by hand from the Actions tab.

If the Powdr PDF layout changes, the parser test is `node scripts/test/run-fixture.mjs`, which reads a captured copy of the October 18, 2026 layout.

## Logo and home screen

The logo source is `icons/logo.svg`. `icons/` also holds the favicon, the 180 px `apple-touch-icon.png` Safari uses when you add the site to your home screen, Android/Chrome icons and `manifest.webmanifest`, so the saved app is named "Ski Weather" and opens full screen.

## Hosting

GitHub Pages, deployed from the `main` branch root. The page has no build step: `index.html` plus the JSON files in `data/`.
