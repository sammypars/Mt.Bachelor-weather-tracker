# Mt. Bachelor Weather Tracker

One page for Mt. Bachelor ski weather: summit, mid-mountain and base forecasts, new snow totals, summit wind, freezing level, the resort's snow report and lift status, the daily Powdr Forecasts report, NOAA forecasts, alerts and forecaster discussion, on-mountain weather stations, an interactive map, and live webcams.

Live site: https://sammypars.github.io/Mt.Bachelor-weather-tracker/

## What is on the page

- **At a glance**: new snow next 24/48/72 hours and 7 days, summit wind with compass, a temperature-by-elevation graphic with the freezing level, and the official Mt. Bachelor snow report.
- **Mountain status**: lifts and trails open, grooming, Central Oregon Avalanche Center danger, and the full mountain report.
- **7-day outlook, every source**: NOAA, Mt. Bachelor, Powdr Forecasts and the Open-Meteo model side by side for each day, with a note on how closely they agree.
- **Powdr Forecasts**: the daily PDF parsed into readable tables (base temps, wet bulb, precip, wind at 6,300 and 7,800 ft), the extended outlook and the forecaster discussion.
- **Next 72 hours**: chart of temperature at three elevations, summit snowfall with precip chance, or wind and gusts, plus an hour-by-hour strip.
- **Mountain map**: terrain, satellite or street base maps with animated wind, a new-snow accumulation layer, precipitation and temperature (with the 32 degree line), a 72-hour time slider with playback, live NOAA NEXRAD radar loop, lift lines and real station readings.
- **NOAA forecast**: NWS Pendleton point forecast for the summit and the Area Forecast Discussion.
- **Weather stations and webcams**: Mt. Bachelor's on-mountain stations with 24-hour trends, nine resort webcams and two Century Drive road cams.

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
| Lift lines (OpenStreetMap) | `data/lifts.geojson`, fetched once |

The collector is `scripts/collect.mjs` and the Powdr PDF parser is `scripts/powdr.mjs`. Run it locally with `npm ci && node scripts/collect.mjs`. The workflow is `.github/workflows/update-data.yml`; you can also start it by hand from the Actions tab.

If the Powdr PDF layout changes, the parser test is `node scripts/test/run-fixture.mjs`, which reads a captured copy of the October 18, 2026 layout.

## Hosting

GitHub Pages, deployed from the `main` branch root. The page has no build step: `index.html` plus the JSON files in `data/`.
