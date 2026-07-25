import {
  boundsCenter,
  fetchTigerBoundary,
  geometryBounds,
  searchTigerGeographies,
} from '../src/tiger.js';
import {
  buildMockEnvironmentMarkers,
  canonicalOnboardingGeography,
  createOutsideMaskFeature,
  createPrototypeEntitlement,
  entitlementAllows,
  validateFeatureIdentity,
} from '../src/environment.js';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function retry(label, operation, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.warn(`${label} attempt ${attempt} failed: ${error.message}`);
        await sleep(750 * attempt);
      }
    }
  }
  throw lastError;
}

const results = await retry('TIGERweb search', () => searchTigerGeographies('Portsmouth VA'));
const portsmouth = results.find((result) => /Portsmouth/i.test(result.name));

if (!portsmouth) {
  throw new Error('TIGERweb search did not return Portsmouth, Virginia.');
}

const boundary = await retry('TIGERweb boundary', () => fetchTigerBoundary(portsmouth));
if (!['Polygon', 'MultiPolygon'].includes(boundary.geometry?.type)) {
  throw new Error(`Unexpected TIGERweb geometry type: ${boundary.geometry?.type ?? 'none'}`);
}

validateFeatureIdentity(portsmouth, boundary);
const bounds = geometryBounds(boundary.geometry);
const center = boundsCenter(bounds) ?? portsmouth.center;
if (!bounds || !center) throw new Error('Portsmouth boundary did not produce a usable extent.');

const canonical = canonicalOnboardingGeography(portsmouth, boundary, center, bounds);
const entitlement = createPrototypeEntitlement(canonical, boundary);
if (!entitlementAllows(entitlement, canonical)) {
  throw new Error('Validated geography entitlement did not authorize its own canonical geography.');
}

const tampered = { ...canonical, objectId: Number(canonical.objectId) + 1 };
if (entitlementAllows(entitlement, tampered)) {
  throw new Error('Tampered geography incorrectly matched the validated entitlement.');
}

const mask = createOutsideMaskFeature(boundary.geometry);
if (mask?.geometry?.type !== 'Polygon' || mask.geometry.coordinates.length < 2) {
  throw new Error('Selected geography did not produce an outside-territory mask.');
}

const mockMarkers = buildMockEnvironmentMarkers(center, bounds);
if (mockMarkers.length === 0 || mockMarkers.some((marker) => !['platinum', 'resource'].includes(marker.kind))) {
  throw new Error('Controlled environment mock markers contain an unsupported membership tier.');
}

const vectorResponse = await retry('OpenFreeMap vector source', () =>
  fetch('https://tiles.openfreemap.org/planet').then((response) => {
    if (!response.ok) throw new Error(`OpenFreeMap returned HTTP ${response.status}`);
    return response;
  }),
);

const vectorPayload = await vectorResponse.json();
if (!Array.isArray(vectorPayload.tiles) || vectorPayload.tiles.length === 0) {
  throw new Error('OpenFreeMap TileJSON did not contain vector tile URLs.');
}

console.log(
  `GIS smoke test passed: ${portsmouth.name} (${portsmouth.type}), ${boundary.geometry.type}, controlled entitlement/mask valid, Platinum/resource markers only, OpenFreeMap vector tiles available.`,
);
