const WORLD_RING = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
];

function exteriorRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') {
    return geometry.coordinates?.[0] ? [geometry.coordinates[0]] : [];
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates || [])
      .map((polygon) => polygon?.[0])
      .filter(Boolean);
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

export function geographyKey(geography) {
  if (!geography) return '';
  return [
    geography.service,
    geography.layerId,
    geography.objectId,
    geography.geoid || '',
  ].join(':');
}

export function canonicalOnboardingGeography(
  location,
  feature,
  center,
  bounds,
) {
  return Object.freeze({
    id: location.id,
    service: location.service,
    layerId: location.layerId,
    objectId: location.objectId,
    geoid:
      location.geoid ||
      feature?.properties?.GEOID ||
      feature?.properties?.GEOID20 ||
      null,
    name: location.name,
    state: location.state || '',
    stateName: location.stateName || '',
    type: location.type,
    vintage: location.vintage,
    center: Object.freeze([...center]),
    bounds: Object.freeze(
      bounds.map((corner) => Object.freeze([...corner])),
    ),
    validatedAt: new Date().toISOString(),
  });
}

export function validateFeatureIdentity(location, feature) {
  if (
    !feature?.geometry ||
    !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)
  ) {
    throw new Error('The selected geography did not return a valid polygon.');
  }

  const returnedObjectId =
    feature.properties?.OBJECTID ??
    feature.properties?.ObjectID ??
    null;

  if (
    returnedObjectId !== null &&
    Number(returnedObjectId) !== Number(location.objectId)
  ) {
    throw new Error('The geography identity did not match the selected result.');
  }

  const returnedGeoid =
    feature.properties?.GEOID ??
    feature.properties?.GEOID20 ??
    feature.properties?.ZCTA5 ??
    null;

  if (
    location.geoid &&
    returnedGeoid &&
    String(returnedGeoid) !== String(location.geoid)
  ) {
    throw new Error('The geography identifier changed during validation.');
  }

  return true;
}

export function createPrototypeEntitlement(geography, boundaryFeature) {
  const entitlementId =
    globalThis.crypto?.randomUUID?.() ||
    `prototype-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return Object.freeze({
    entitlementId,
    geographyKey: geographyKey(geography),
    geography,
    boundaryFeature,
    issuedAt: new Date().toISOString(),
  });
}

export function entitlementAllows(entitlement, geography) {
  return Boolean(
    entitlement &&
      geography &&
      entitlement.geographyKey === geographyKey(geography),
  );
}
