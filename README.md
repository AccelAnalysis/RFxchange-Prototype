# The RFxchange Map

This repository has been reset to a minimal map-only application.

There is no onboarding flow, geography search, entitlement logic, mock environment, mock marker data, React application, or Tailwind UI in the current build.

## What runs

- Vite serves and builds the site.
- MapLibre GL JS renders one full-screen interactive map.
- CARTO/OpenStreetMap raster tiles provide the live basemap.
- OpenFreeMap/OpenMapTiles building data is added as a live vector source and rendered as 3D building extrusions.
- The initial camera opens over Portsmouth, Virginia in a pitched bird's-eye view so the 3D behavior is immediately testable.

## Local development

```bash
npm install
npm run dev
```

## Production validation

```bash
npm run build
npm run check:map-bundle
npm run smoke:map
```

CI also installs Chromium, starts the built Vite preview, opens the GitHub Pages path in a real browser, waits for MapLibre to reach an idle map state, confirms successful basemap tile responses and a visible canvas, confirms the 3D building layer was added, and saves a screenshot artifact.

## GitHub Pages

The production base path is `/RFxchange-Prototype/`. GitHub Pages should use **GitHub Actions** as its deployment source.

Same-repository `codex/*` pull requests automatically merge after the `Build` workflow succeeds.
