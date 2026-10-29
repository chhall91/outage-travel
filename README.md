# Outage Travel

Offline phone web app for traveling nuclear outage workers. Pick your outage (plant + dates) and it gives you housing searches, GSA per diem & weekly pay estimate, and a crew board for rooms & rides.

Live: https://chhall91.github.io/outage-travel/

## Data
- Plants: NRC List of Power Reactor Units (https://www.nrc.gov/reactors/operating/list-power-reactor-units.html) + EIA Power Plants layer for coordinates/county (`data-src/`). Palisades coordinates approximate.
- Per diem: GSA FY2027 CONUS rates, `FY2027_PerDiemRates_Validated090126.xlsx` (gsa.gov), bundled.
- Unit status: NRC Power Reactor Status Report (365-day file), fetched daily by the GitHub Action (headless Chrome; nrc.gov has no CORS) into `public/reactor-status.json`.
- Upcoming outages: only publicly published dates with a source (`src/data/upcoming.json`).

`npm test` · `npm run data` (rebuild plants/per diem) · `npm run status` (refresh NRC snapshot) · `npm run build:pages`

## Forum
Overall board + one per plant (Housing, Food & local, Rides, Work & pay, General). UI: `src/forum-ui.js`; rules: `src/lib/forum.js`; data adapter: `src/lib/forum-api.js`.
- **Supabase** when `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set at build time (schema + RLS: `supabase/schema.sql`, setup: `docs/supabase-setup.md`).
- **Local test server** (Node + SQLite): `npm run build:tunnel && npm run forum:server -- --static dist-tunnel` → http://localhost:8787
- Neither set → "Forum is coming soon".
