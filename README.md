# The RFxchange Prototype

A standalone React prototype for The RFxchange business registration, geography onboarding, and controlled local map environment.

This repository is intentionally independent from the `hi-coworking` application. It contains its own application entry point, package configuration, styling pipeline, map dependency, GIS integration, build workflow, and GitHub Pages deployment workflow.

## Prototype flow

1. Create a mock business account.
2. Enter the locality-selection journey.
3. Search live U.S. Census TIGERweb geographies rather than a preset list.
4. Select a geography and retrieve its authoritative polygon or multipolygon.
5. Validate the selected feature identity and store the canonical geography in onboarding state.
6. Frame that locality in a 3D birds-eye MapLibre view and mute territory outside the selected boundary.
7. Revalidate the selected geography before entering the controlled RFxchange environment.
8. Show only mock official-resource and Platinum-level user markers inside the selected locality.

Bronze, Silver, and Gold users are intentionally not represented in the controlled-map mock data.

## Geography and map data

- Geography search and selected-locality boundaries: U.S. Census TIGERweb REST services.
- Basemap: CARTO raster tiles derived from OpenStreetMap data.
- 3D buildings: OpenFreeMap / OpenMapTiles vector building data rendered with MapLibre fill extrusion.
- Selected territory: highlighted with its Census boundary.
- Other territory: visually muted during onboarding and treated as unavailable for full participation.

## Geography authorization model

The UI does not initialize a controlled RFxchange environment merely from an editable `selectedGeography` React value. Geography selection first retrieves and validates the Census feature, creates a canonical onboarding geography record, and creates a separate validated entitlement object. Environment entry re-fetches the Census boundary and verifies that the onboarding geography still matches the validated entitlement.

### Production security boundary

GitHub Pages is a static hosting platform. Therefore a Pages-only build cannot provide a cryptographically trustworthy authorization boundary against a user who deliberately modifies JavaScript execution in their own browser. The current entitlement object is a prototype control that prevents ordinary client-state changes from switching the active environment, but it must not be treated as production authorization.

For production, geography entitlement must be issued and enforced by an authenticated server/API. The server should:

- validate the requested geography against the authoritative GIS source;
- persist the user's selected geography in the onboarding/account record;
- issue or return the user's authorized geography entitlement;
- filter organizations, resources, opportunities, referrals, and actions by that entitlement;
- reject requests for geography-scoped participation that are not authorized for the authenticated user.

The browser should then render the server-authorized geography rather than deciding access from local state.

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

The production bundle is written to `dist/`. CI performs both the Vite production build and a live GIS smoke test against TIGERweb and OpenFreeMap.

## GitHub Pages

The production Vite base path is `/RFxchange-Prototype/`. Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The deployment workflow publishes `dist/` after changes reach `main`.
