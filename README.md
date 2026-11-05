# Arizona Election Results

A faster, color-coded view of the Arizona 2026 General Election results.

**Data source:** `https://app.enhancedvoting.com/cdn/results/Arizona/export-110326GeneralElection.json` (always).

## How data flows

- The source sends no CORS headers, so a GitHub Action ([deploy.yml](.github/workflows/deploy.yml)) downloads the raw export every 10 minutes, writes `data/export.json` and a small `data/meta.json` (md5, timestamps), and redeploys Pages only when the md5 changed.
- The browser checks `meta.json`, downloads the full export only if it changed, parses it in a Web Worker, reduces it to a compact model (statewide + county, by vote method) and stores it in IndexedDB. It re-checks every hour, when the tab regains focus, and on **Refresh now** (which forces a re-download).
- Offline or on failure, the last saved data is shown.

## Color coding

- Candidates: party colors; ballot measures/judges: YES green / NO orange.
- Vote methods: Early, Election Day, Provisional, Early A.R.S. 16-579, Late Early (stacked bars, per contest and per candidate, plus a "who won each method" matrix).
- Lead badges: shaded by margin tier (hatched/dashed = within 0.5 pt, solid = tight, lighter = safer).

## Develop

```
npm install
npm run fetch-data   # downloads the export into public/data (gitignored)
npm run dev
npm test
npm run build
```

## Deploy

Push to `main` and set Settings → Pages → Source to **GitHub Actions**. Vite uses a relative base, so any repo name works.
