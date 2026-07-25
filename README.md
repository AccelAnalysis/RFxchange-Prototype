# The RFxchange Prototype

A standalone React prototype for The RFxchange business registration, geography onboarding, and 3D locality map experience.

This repository is intentionally independent from the `hi-coworking` application. It contains its own application entry point, package configuration, styling pipeline, map dependency, GIS integration, build workflow, and GitHub Pages deployment workflow.

## Prototype flow

1. Enter business account information.
2. Search live U.S. geographies.
3. Select a geography and retrieve its authoritative polygon or multipolygon.
4. Validate the selected feature identity and store the canonical geography in onboarding state.
5. Frame that locality in a 3D bird's-eye MapLibre view.
6. Outline the selected locality and visually mute geography outside it.
7. Revalidate the geography before opening the map experience.
8. Continue on the same live 3D map with no fabricated businesses, resources, or map markers.

## Geography and map data

- Geography search and selected-locality boundaries: U.S. Census TIGERweb REST services.
- Basemap: OpenFreeMap dark vector style rendered by MapLibre GL JS.
- 3D buildings: OpenFreeMap / OpenMapTiles building data rendered with MapLibre fill extrusion.
- Selected territory: highlighted with its authoritative boundary.
- Other territory: visually muted during onboarding.
- Mock map entities: none.

## Geography authorization model

The UI does not initialize a selected locality merely from an editable `selectedGeography` React value. Geography selection first retrieves and validates the feature, creates a canonical onboarding geography record, and creates a separate validated entitlement object. Entry re-fetches the boundary and verifies that the onboarding geography still matches the validated entitlement.

### Production security boundary

GitHub Pages is static hosting. A Pages-only build cannot provide a cryptographically trustworthy authorization boundary against a user who deliberately modifies JavaScript execution in their own browser.

For production, geography entitlement must be issued and enforced by an authenticated server/API. The server should:

- validate the requested geography against the authoritative GIS source;
- persist the user's selected geography in the onboarding/account record;
- issue or return the user's authorized geography entitlement;
- filter organizations, resources, opportunities, referrals, and actions by that entitlement;
- reject requests for geography-scoped participation that are not authorized for the authenticated user.

The browser should render the server-authorized geography rather than deciding access from local state.

## Local development

Requirements:

- Node.js 22 recommended; Node.js 20.19 or newer supported.
- npm 10 or newer recommended.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Production build and GIS smoke test

```bash
npm run build
npm run smoke:gis
npm run preview
```

The production bundle is written to `dist/`. CI performs the Vite production build, verifies the MapLibre worker bundle, and runs a live GIS smoke test against TIGERweb and OpenFreeMap.

## GitHub Pages

The production Vite base path is `/RFxchange-Prototype/`. Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The deployment workflow publishes `dist/` after changes reach `main`.

Same-repository `codex/*` pull requests are automatically squash-merged after the `Build` workflow succeeds.
