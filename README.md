# Edmonton Discovery

A District-style dining and events explorer for Edmonton, built from City of Edmonton open data.

## What's inside

- **2,987 dining listings** across 313 Edmonton neighbourhoods (searchable)
- **51 upcoming events** grouped by month
- Single self-contained `index.html` — no build step, no server needed

## View it

Open `index.html` in any browser, or enable GitHub Pages on this repo for a live link.

## Data source

City of Edmonton open data portal. Dining data comes from business licence records (no phone/hours available in the source data).

## Updating the data

The app is a single self-contained `index.html` with the data baked in. To refresh it with the latest restaurants and events:

1. **Pull fresh data** — download the latest from Edmonton's open data:
   - Dining: business licence records at `data.edmonton.ca/resource/qhi4-bdpu.json` (filter for restaurant and food truck categories)
   - Events: `data.edmonton.ca/resource/64u3-c7bh.json` (upcoming events, ordered by date)
2. **Rebuild the data block** — format the fresh data as a JavaScript block:
   ```js
   const DINING=[...];
   const EVENTS=[...];
   const SEED_DATE="YYYY-MM-DD";
   ```
   Each dining entry is `[name, type, address, neighbourhood, latitude, longitude]`. Each event entry has `t` (title), `b` (date), `st`/`et` (start/end time), `type`, `v` (venue), `hood` (neighbourhood), `link`.
3. **Swap it into index.html** — replace the existing data section (the block starting at `const DINING=` through the `SEED_DATE` line) with the new block. Everything else in the file stays untouched.
4. **Push** — commit and push the updated `index.html`:
   ```
   git add index.html
   git commit -m "Refresh data YYYY-MM-DD"
   git push origin main
   ```
   If GitHub Pages is enabled, the live site updates automatically.

## Built

October 2026
