const providers = [
  {
    name: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/12/1179/1605.png',
  },
  {
    name: 'CARTO',
    url: 'https://a.basemaps.cartocdn.com/light_all/12/1179/1605.png',
  },
];

for (const provider of providers) {
  const response = await fetch(provider.url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'RFxchange-Prototype-CI/1.1',
    },
  });

  if (!response.ok) {
    throw new Error(`${provider.name} tile returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`${provider.name} tile returned unexpected content type: ${contentType || 'none'}`);
  }
}

console.log('Map dependency smoke test passed: OpenStreetMap and CARTO each returned a valid image tile.');
