# The RFxchange Map

This repository currently serves one deployable artifact: a static RFxchange map baseline.

The same `index.html` works in both GitHub Pages modes:

- **GitHub Actions Pages deployment** copies the static artifact from `dist/`.
- **Repository-root Pages deployment** can also serve the same current `index.html` directly.

That removes the previous split where source files, build output, cached bundles, and older map runtimes could make the public URL appear to serve a black-screen overlay experience.

## Current build

`rfx-current-static-2026-07-25-1`

The current page includes this fingerprint in:

- `<meta name="rfx-build">`
- `document.documentElement.dataset.rfxBuild`
- `dist/CURRENT_BUILD.json` after `npm run build`

## What runs

- A self-contained static `index.html` page.
- Leaflet 1.9.4 loaded from CDN.
- OpenStreetMap raster tiles as the primary basemap.
- CARTO raster tiles as the fallback basemap.
- A full-screen map centered on Portsmouth, Virginia.
- A light grid failure surface instead of any dark or black map background.

## What is intentionally not in the current build

The current artifact does not include onboarding, account registration, geography entitlement, mock environment panels, marker data, or the future production 3D controlled-locality experience. Those should be rebuilt on top of a reliable deployment baseline after the public map is consistently serving the current artifact.

## Local commands

```bash
npm install
npm run build
npm run smoke:map
```

## Production validation

The GitHub Actions deploy workflow rejects legacy runtime remnants, requires the current build fingerprint in the deployed HTML, and browser-validates the public Pages URL in Chromium, desktop WebKit, and iPhone-sized WebKit.

## GitHub Pages

The production URL is:

`https://accelanalysis.github.io/RFxchange-Prototype/`

GitHub Pages should use **GitHub Actions** as its deployment source, but this repository-root static fallback is kept so the same current map is served even if Pages is pointed at the root branch source.
