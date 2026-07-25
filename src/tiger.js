const TIGER_ROOT = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb';

const STATE_META = {
  AL: ['01', 'Alabama'], AK: ['02', 'Alaska'], AZ: ['04', 'Arizona'], AR: ['05', 'Arkansas'],
  CA: ['06', 'California'], CO: ['08', 'Colorado'], CT: ['09', 'Connecticut'], DE: ['10', 'Delaware'],
  DC: ['11', 'District of Columbia'], FL: ['12', 'Florida'], GA: ['13', 'Georgia'], HI: ['15', 'Hawaii'],
  ID: ['16', 'Idaho'], IL: ['17', 'Illinois'], IN: ['18', 'Indiana'], IA: ['19', 'Iowa'],
  KS: ['20', 'Kansas'], KY: ['21', 'Kentucky'], LA: ['22', 'Louisiana'], ME: ['23', 'Maine'],
  MD: ['24', 'Maryland'], MA: ['25', 'Massachusetts'], MI: ['26', 'Michigan'], MN: ['27', 'Minnesota'],
  MS: ['28', 'Mississippi'], MO: ['29', 'Missouri'], MT: ['30', 'Montana'], NE: ['31', 'Nebraska'],
  NV: ['32', 'Nevada'], NH: ['33', 'New Hampshire'], NJ: ['34', 'New Jersey'], NM: ['35', 'New Mexico'],
  NY: ['36', 'New York'], NC: ['37', 'North Carolina'], ND: ['38', 'North Dakota'], OH: ['39', 'Ohio'],
  OK: ['40', 'Oklahoma'], OR: ['41', 'Oregon'], PA: ['42', 'Pennsylvania'], RI: ['44', 'Rhode Island'],
  SC: ['45', 'South Carolina'], SD: ['46', 'South Dakota'], TN: ['47', 'Tennessee'], TX: ['48', 'Texas'],
  UT: ['49', 'Utah'], VT: ['50', 'Vermont'], VA: ['51', 'Virginia'], WA: ['53', 'Washington'],
  WV: ['54', 'West Virginia'], WI: ['55', 'Wisconsin'], WY: ['56', 'Wyoming'],
  AS: ['60', 'American Samoa'], GU: ['66', 'Guam'], MP: ['69', 'Northern Mariana Islands'],
  PR: ['72', 'Puerto Rico'], VI: ['78', 'U.S. Virgin Islands'],
};

const STATE_BY_FIPS = Object.fromEntries(
  Object.entries(STATE_META).map(([abbr, [fips, name]]) => [fips, { abbr, name }]),
);

const SEARCH_LAYERS = [
  { service: 'State_County', layerId: 0, type: 'State', priority: 1 },
  { service: 'State_County', layerId: 1, type: 'County', priority: 2, stateScoped: true },
  { service: 'Places_CouSub_ConCity_SubMCD', layerId: 3, type: 'Consolidated city', priority: 3, stateScoped: true },
  { service: 'Places_CouSub_ConCity_SubMCD', layerId: 4, type: 'Incorporated place', priority: 4, stateScoped: true },
  { service: 'Places_CouSub_ConCity_SubMCD', layerId: 5, type: 'Census-designated place', priority: 5, stateScoped: true },
  { service: 'Places_CouSub_ConCity_SubMCD', layerId: 1, type: 'County subdivision', priority: 6, stateScoped: true },
  { service: 'Places_CouSub_ConCity_SubMCD', layerId: 0, type: 'Estate', priority: 7, stateScoped: true },
  { service: 'Places_CouSub_ConCity_SubMCD', layerId: 2, type: 'Subbarrio', priority: 8, stateScoped: true },
  { service: 'PUMA_TAD_TAZ_UGA_ZCTA', layerId: 1, type: 'ZIP Code Tabulation Area', priority: 9, zipOnly: true },
  { service: 'CBSA', layerId: 3, type: 'Metropolitan Statistical Area', priority: 10 },
  { service: 'CBSA', layerId: 4, type: 'Micropolitan Statistical Area', priority: 11 },
  { service: 'CBSA', layerId: 2, type: 'Metropolitan Division', priority: 12 },
  { service: 'CBSA', layerId: 0, type: 'Combined Statistical Area', priority: 13 },
];

function parseSearchText(input) {
  let term = input.trim().replace(/\s+/g, ' ');
  let stateCode = null;
  let stateAbbr = null;

  const stateMatch = term.match(/(?:,\s*|\s+)([A-Za-z]{2})$/);
  if (stateMatch) {
    const candidate = stateMatch[1].toUpperCase();
    if (STATE_META[candidate]) {
      [stateCode] = STATE_META[candidate];
      stateAbbr = candidate;
      term = term.slice(0, stateMatch.index).trim().replace(/,$/, '').trim();
    }
  }

  if (!stateCode) {
    const lower = term.toLowerCase();
    const namedState = Object.entries(STATE_META)
      .map(([abbr, [fips, name]]) => ({ abbr, fips, name }))
      .sort((a, b) => b.name.length - a.name.length)
      .find(({ name }) => lower === name.toLowerCase() || lower.endsWith(`, ${name.toLowerCase()}`) || lower.endsWith(` ${name.toLowerCase()}`));

    if (namedState && lower !== namedState.name.toLowerCase()) {
      stateCode = namedState.fips;
      stateAbbr = namedState.abbr;
      term = term.slice(0, term.length - namedState.name.length).trim().replace(/,$/, '').trim();
    }
  }

  return {
    term,
    normalizedTerm: term.toUpperCase(),
    stateCode,
    stateAbbr,
    isZip: /^\d{5}$/.test(term),
  };
}

function escapeSqlLike(value) {
  return value.replace(/'/g, "''");
}

function layerUrl(layer) {
  return `${TIGER_ROOT}/${layer.service}/MapServer/${layer.layerId}`;
}

function buildWhere(layer, parsed) {
  const safeTerm = escapeSqlLike(parsed.normalizedTerm);
  const nameClause = `(UPPER(NAME) LIKE '%${safeTerm}%' OR UPPER(BASENAME) LIKE '%${safeTerm}%')`;
  const stateClause = parsed.stateCode && layer.stateScoped ? ` AND STATE='${parsed.stateCode}'` : '';
  return `${nameClause}${stateClause}`;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function displayState(attributes) {
  const state = STATE_BY_FIPS[String(attributes.STATE ?? '').padStart(2, '0')];
  return state ?? null;
}

function scoreResult(result, parsed) {
  const basename = (result.basename || '').toUpperCase();
  const name = (result.name || '').toUpperCase();
  let score = result.priority * 10;
  if (basename === parsed.normalizedTerm || name === parsed.normalizedTerm) score -= 50;
  else if (basename.startsWith(parsed.normalizedTerm) || name.startsWith(parsed.normalizedTerm)) score -= 25;
  if (parsed.stateCode && result.stateFips === parsed.stateCode) score -= 20;
  return score;
}

async function queryLayer(layer, parsed, signal) {
  if (layer.zipOnly && !parsed.isZip) return [];

  const params = new URLSearchParams({
    where: buildWhere(layer, parsed),
    outFields: '*',
    returnGeometry: 'false',
    resultRecordCount: '8',
    f: 'json',
  });

  const response = await fetch(`${layerUrl(layer)}/query?${params}`, { signal });
  if (!response.ok) throw new Error(`TIGERweb ${layer.type} search failed (${response.status})`);

  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || `TIGERweb ${layer.type} search failed`);

  return (payload.features || []).map(({ attributes }) => {
    const state = displayState(attributes);
    const longitude = numberOrNull(attributes.CENTLON ?? attributes.INTPTLON);
    const latitude = numberOrNull(attributes.CENTLAT ?? attributes.INTPTLAT);

    return {
      id: `${layer.service}:${layer.layerId}:${attributes.OBJECTID}`,
      service: layer.service,
      layerId: layer.layerId,
      objectId: attributes.OBJECTID,
      geoid: attributes.GEOID ?? attributes.ZCTA5 ?? null,
      name: attributes.NAME || attributes.BASENAME || layer.type,
      basename: attributes.BASENAME || attributes.NAME || '',
      type: layer.type,
      priority: layer.priority,
      stateFips: attributes.STATE ?? null,
      state: state?.abbr ?? '',
      stateName: state?.name ?? '',
      center: longitude !== null && latitude !== null ? [longitude, latitude] : null,
      vintage: layer.service === 'PUMA_TAD_TAZ_UGA_ZCTA' ? '2020 Census' : 'Current TIGERweb',
    };
  });
}

export async function searchTigerGeographies(input, { signal } = {}) {
  const parsed = parseSearchText(input);
  if (parsed.term.length < 2) return [];

  const settled = await Promise.allSettled(
    SEARCH_LAYERS.map((layer) => queryLayer(layer, parsed, signal)),
  );

  if (signal?.aborted) throw new DOMException('Search aborted', 'AbortError');

  const results = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  const unique = new Map(results.map((result) => [result.id, result]));

  return [...unique.values()]
    .map((result) => ({ ...result, score: scoreResult(result, parsed) }))
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .slice(0, 15);
}

export async function fetchTigerBoundary(location, { signal } = {}) {
  const params = new URLSearchParams({
    where: `OBJECTID=${Number(location.objectId)}`,
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
    geometryPrecision: '5',
    f: 'geojson',
  });

  const response = await fetch(`${layerUrl(location)}/query?${params}`, { signal });
  if (!response.ok) throw new Error(`TIGERweb boundary request failed (${response.status})`);

  const payload = await response.json();
  const feature = payload.features?.[0];
  if (!feature?.geometry) throw new Error('TIGERweb returned no boundary geometry for this geography.');

  return feature;
}

export function geographyLabel(location) {
  if (!location) return '';
  const nameAlreadyHasState = location.stateName && location.name.toLowerCase().includes(location.stateName.toLowerCase());
  if (location.state && !nameAlreadyHasState) return `${location.name}, ${location.state}`;
  return location.name;
}

export function geometryBounds(geometry) {
  if (!geometry?.coordinates) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  const visit = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      west = Math.min(west, value[0]);
      east = Math.max(east, value[0]);
      south = Math.min(south, value[1]);
      north = Math.max(north, value[1]);
      return;
    }
    value.forEach(visit);
  };

  visit(geometry.coordinates);
  return Number.isFinite(west) ? [[west, south], [east, north]] : null;
}

export function boundsCenter(bounds) {
  if (!bounds) return null;
  return [
    (bounds[0][0] + bounds[1][0]) / 2,
    (bounds[0][1] + bounds[1][1]) / 2,
  ];
}
