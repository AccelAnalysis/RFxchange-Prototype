# The RFxchange Map

This repository is currently reduced to a minimal 2D map baseline.

There is no onboarding flow, geography search, entitlement logic, mock environment, marker data, React application, Tailwind UI, MapLibre/WebGL renderer, 3D building layer, or map overlay in this build.

## What runs

- Vite serves and builds the site.
- Leaflet renders one full-screen interactive 2D map.
- Standard OpenStreetMap raster tiles provide the basemap.
- The initial view opens over Portsmouth, Virginia.
- The page behind the map is light gray so a failed map cannot be mistaken for a dark map style.

## Local development

```bash
npm install
npm run dev
```

## Production validation

```bash
npm run build
npm run smoke:map
```

CI installs Chromium and WebKit, serves the production build at the GitHub Pages path, and requires both browser engines to display the Leaflet container and successfully load visible OpenStreetMap tile images. Screenshots from both engines are saved as artifacts.

## GitHub Pages

The production base path is `/RFxchange-Prototype/`. GitHub Pages should use **GitHub Actions** as its deployment source.

Same-repository `codex/*` pull requests automatically merge after the `Build` workflow succeeds.
