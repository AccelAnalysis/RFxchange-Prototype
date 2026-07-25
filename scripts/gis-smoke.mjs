import { fetchTigerBoundary, searchTigerGeographies } from '../src/tiger.js';

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

console.log(`GIS smoke test passed: ${portsmouth.name} (${portsmouth.type}), ${boundary.geometry.type}, OpenFreeMap vector tiles available.`);
