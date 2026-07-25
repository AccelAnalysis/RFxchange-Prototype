const OSM_TILE = 'https://tile.openstreetmap.org/12/1179/1605.png';

const response = await fetch(OSM_TILE, {
  redirect: 'follow',
  headers: {
    'User-Agent': 'RFxchange-Prototype-CI/1.0',
  },
});

if (!response.ok) {
  throw new Error(`OpenStreetMap tile returned HTTP ${response.status}`);
}

const contentType = response.headers.get('content-type') || '';
if (!contentType.startsWith('image/')) {
  throw new Error(`OpenStreetMap tile returned unexpected content type: ${contentType || 'none'}`);
}

console.log('Map dependency smoke test passed: OpenStreetMap returned a valid image tile.');
