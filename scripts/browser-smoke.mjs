import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

let basemapTiles = 0;
const pageErrors = [];

page.on('response', (response) => {
  if (response.url().includes('basemaps.cartocdn.com') && response.ok()) {
    basemapTiles += 1;
  }
});

page.on('pageerror', (error) => {
  pageErrors.push(error.message);
});

try {
  await page.goto('http://127.0.0.1:4173/RFxchange-Prototype/', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });

  await page.waitForSelector('.maplibregl-canvas', {
    state: 'visible',
    timeout: 20_000,
  });

  await page.waitForFunction(
    () => document.documentElement.dataset.mapReady === 'true',
    null,
    { timeout: 30_000 },
  );

  const state = await page.evaluate(() => {
    const map = document.getElementById('map');
    const canvas = document.querySelector('.maplibregl-canvas');
    const mapRect = map?.getBoundingClientRect();
    const canvasRect = canvas?.getBoundingClientRect();

    return {
      mapLoaded: document.documentElement.dataset.mapLoaded,
      buildingsLayer: document.documentElement.dataset.buildingsLayer,
      mapWidth: mapRect?.width ?? 0,
      mapHeight: mapRect?.height ?? 0,
      canvasWidth: canvasRect?.width ?? 0,
      canvasHeight: canvasRect?.height ?? 0,
    };
  });

  if (state.mapLoaded !== 'true') throw new Error('MapLibre load event did not fire.');
  if (state.buildingsLayer !== 'ready') throw new Error('3D building layer was not added.');
  if (state.mapWidth < 300 || state.mapHeight < 300) throw new Error('Map container has unusable dimensions.');
  if (state.canvasWidth < 300 || state.canvasHeight < 300) throw new Error('MapLibre canvas has unusable dimensions.');
  if (basemapTiles === 0) throw new Error('Browser did not successfully load any basemap tiles.');
  if (pageErrors.length > 0) throw new Error(`Browser page error: ${pageErrors.join(' | ')}`);

  await page.screenshot({ path: 'map-smoke.png', fullPage: true });
  console.log(`Browser map smoke test passed: ${basemapTiles} basemap tile response(s), visible MapLibre canvas, 3D layer added.`);
} finally {
  await browser.close();
}
