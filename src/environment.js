const WORLD_RING = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
];

const MARKER_BLUEPRINTS = [
  { id: 'resource-1', kind: 'resource', label: 'Local Economic Development Office', dx: -0.09, dy: 0.07 },
  { id: 'resource-2', kind: 'resource', label: 'Small Business Resource Center', dx: 0.08, dy: -0.08 },
  { id: 'platinum-1', kind: 'platinum', label: 'Harbor Point Strategies · Platinum', dx: -0.04, dy: -0.02 },
  { id: 'platinum-2', kind: 'platinum', label: 'Commonwealth Technical Group · Platinum', dx: 0.035, dy: 0.035 },
  { id: 'platinum-3', kind: 'platinum', label: 'CivicWorks Partners · Platinum', dx: 0.11, dy: 0.08 },
];

function exteriorRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates?.[0] ? [geometry.coordinates[0]] : [];
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates || []).map((polygon) => polygon?.[0]).filter(Boolean);
  }
  return [];
}

export function createOutsideMaskFeature(geometry) {
  const selectedExteriors = exteriorRings(geometry);
  if (selectedExteriors.length === 0) return null;

  return {
    type: 'Feature',
    properties: { role: 'outside-selected-geography' },
    geometry: {
      type: 'Polygon',
      coordinates: [WORLD_RING, ...selectedExteriors],
    },
  };
}

export function buildMockEnvironmentMarkers(center, bounds) {
  const width = Math.max((bounds?.[1]?.[0] ?? center[0] + 0.05) - (bounds?.[0]?.[0] ?? center[0] - 0.05), 0.025);
  const height = Math.max((bounds?.[1]?.[1] ?? center[1] + 0.05) - (bounds?.[0]?.[1] ?? center[1] - 0.05), 0.025);

  return MARKER_BLUEPRINTS.map((marker) => ({
    ...marker,
    coords: [center[0] + width * marker.dx, center[1] + height * marker.dy],
  }));
}

export function geographyKey(geography) {
  if (!geography) return '';
  return [geography.service, geography.layerId, geography.objectId, geography.geoid || ''].join(':');
}

export function canonicalOnboardingGeography(location, feature, center, bounds) {
  return Object.freeze({
    id: location.id,
    service: location.service,
    layerId: location.layerId,
    objectId: location.objectId,
    geoid: location.geoid || feature?.properties?.GEOID || feature?.properties?.GEOID20 || null,
    name: location.name,
    state: location.state || '',
    stateName: location.stateName || '',
    type: location.type,
    vintage: location.vintage,
    center: Object.freeze([...center]),
    bounds: Object.freeze(bounds.map((corner) => Object.freeze([...corner]))),
    validatedAt: new Date().toISOString(),
  });
}

export function validateFeatureIdentity(location, feature) {
  if (!feature?.geometry || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
    throw new Error('The selected geography did not return a valid Census polygon.');
  }

  const returnedObjectId = feature.properties?.OBJECTID ?? feature.properties?.ObjectID ?? null;
  if (returnedObjectId !== null && Number(returnedObjectId) !== Number(location.objectId)) {
    throw new Error('The Census geography identity did not match the selected search result.');
  }

  const returnedGeoid = feature.properties?.GEOID ?? feature.properties?.GEOID20 ?? feature.properties?.ZCTA5 ?? null;
  if (location.geoid && returnedGeoid && String(returnedGeoid) !== String(location.geoid)) {
    throw new Error('The Census geography identifier changed during validation.');
  }

  return true;
}

export function createPrototypeEntitlement(geography, boundaryFeature) {
  const entitlementId = globalThis.crypto?.randomUUID?.() || `prototype-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const key = geographyKey(geography);

  return Object.freeze({
    entitlementId,
    geographyKey: key,
    geography,
    boundaryFeature,
    issuedAt: new Date().toISOString(),
    mode: 'prototype-validated',
  });
}

export function entitlementAllows(entitlement, geography) {
  return Boolean(entitlement && geography && entitlement.geographyKey === geographyKey(geography));
}
