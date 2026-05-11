# React shell (Vite) — wildfire map

This is an optional **React + Vite** front-end around the same **D3-only** map logic (`src/initWildfire.ts`, copied from `../js/main.js`). The **entire top of the viewport is the map**; timeline sits over the bottom edge of the map; title, legend, insights, inspector, and filters live in a **scrollable deck below** so nothing covers the basemap.

## Requirements

- Node 18+ and npm

## Commands

```bash
cd "Project 3/react-app"
npm install
npm run dev
```

Build for hosting (outputs `dist/`):

```bash
npm run build
npm run preview
```

## Deploy (GitHub Pages)

1. Build locally (`npm run build`).
2. Upload **`dist/`** contents to your Pages branch (or use an Action that runs `npm ci && npm run build` and publishes `dist`).
3. `vite.config.ts` uses `base: "./"` so relative asset paths work from a subfolder.

## Stack

- **React 18** — layout shell, `useEffect` boots the viz once.
- **D3 v7** + **topojson-client** — loaded from CDN in `index.html` (same as the vanilla page); the interactive graphic remains D3-driven per course rules.

## Data

- `public/data/modis_fires_us.csv` — bundled subset.
- `public/js/fire-data.js` — optional embedded CSV (`window.__MODIS_FIRES_CSV`).
