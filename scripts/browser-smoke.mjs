import { chromium, webkit } from 'playwright';

const TARGET = 'http://127.0.0.1:4173/RFxchange-Prototype/';

async function verify(browserType, name) {
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  let tileResponses = 0;

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('tile.openstreetmap.org') && response.ok()) {
      tileResponses += 1;
    }
  });

  try {
    await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('.leaflet-container', { state: 'visible', timeout: 20_000 });
    await page.waitForFunction(
      () => document.documentElement.dataset.mapReady === 'true',
      null,
      { timeout: 30_000 },
    );
    await page.waitForSelector('.leaflet-tile-loaded', { state: 'visible', timeout: 20_000 });

    const state = await page.evaluate(() => {
      const map = document.getElementById('map');
      const rect = map?.getBoundingClientRect();
      const tiles = [...document.querySelectorAll('.leaflet-tile-loaded')];
      return {
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
        tileCount: tiles.length,
        loadedImages: tiles.filter((tile) => tile.complete && tile.naturalWidth > 0).length,
      };
    });

    if (state.width < 300 || state.height < 300) throw new Error(`${name}: map container has unusable dimensions.`);
    if (state.tileCount === 0 || state.loadedImages === 0) throw new Error(`${name}: no visible map tiles loaded.`);
    if (tileResponses === 0) throw new Error(`${name}: no successful OpenStreetMap tile responses observed.`);
    if (pageErrors.length > 0) throw new Error(`${name}: browser page error: ${pageErrors.join(' | ')}`);

    await page.screenshot({ path: `map-smoke-${name}.png`, fullPage: true });
    console.log(`${name}: 2D map rendered with ${state.loadedImages} loaded tile image(s) and ${tileResponses} successful tile response(s).`);
  } finally {
    await browser.close();
  }
}

await verify(chromium, 'chromium');
await verify(webkit, 'webkit');
