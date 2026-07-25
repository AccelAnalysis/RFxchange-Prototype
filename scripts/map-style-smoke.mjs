const CARTO_TILE = 'https://a.basemaps.cartocdn.com/dark_all/2/1/1@2x.png';
const OPENFREEMAP_TILEJSON = 'https://tiles.openfreemap.org/planet';

async function assertOk(url, label) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  return response;
}

const basemap = await assertOk(CARTO_TILE, 'CARTO basemap tile');
if (!(basemap.headers.get('content-type') || '').startsWith('image/')) {
  throw new Error('CARTO basemap did not return an image tile.');
}

const vectorResponse = await assertOk(OPENFREEMAP_TILEJSON, 'OpenFreeMap TileJSON');
const vector = await vectorResponse.json();
if (!Array.isArray(vector.tiles) || vector.tiles.length === 0) {
  throw new Error('OpenFreeMap TileJSON does not expose vector tiles.');
}

console.log(`Map dependency smoke test passed: CARTO basemap tile and ${vector.tiles.length} OpenFreeMap vector tile template(s) available.`);
