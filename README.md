# The RFxchange Prototype

A standalone React prototype for The RFxchange business registration and geography-selection journey.

This repository is intentionally independent from the `hi-coworking` application. It contains its own application entry point, package configuration, styling pipeline, map dependency, build workflow, and GitHub Pages deployment workflow.

## Prototype flow

1. Create a mock business account.
2. Enter the business-placement journey.
3. Search the included mock geographies.
4. View the selected geography in a pitched MapLibre map.
5. Confirm the geography and complete the prototype flow.

No account, organization, or geography data is persisted. Authentication and location search are mocked for interface testing.

## Local development

Requirements:

- Node.js 22 recommended; Node.js 20.19 or newer supported.
- npm 10 or newer recommended.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Production build

```bash
npm run build
npm run preview
```

The production bundle is written to `dist/`.

## GitHub Pages

The production Vite base path is `/RFxchange-Prototype/`. After the pull request is merged, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions** if it is not already selected. The deployment workflow publishes `dist/`.

## External services

The prototype loads CARTO raster basemap tiles derived from OpenStreetMap data. It does not require a Mapbox token or access to any Hi-Coworking service.
