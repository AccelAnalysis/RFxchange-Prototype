import { chromium, webkit } from 'playwright';
import { PNG } from 'pngjs';

const BASE_TARGET = process.env.MAP_URL || 'http://127.0.0.1:4173/RFxchange-Prototype/';
const EXPECTED_BUILD = 'leaflet-2d-baseline-2026-07-25';
const SCREENSHOT_PREFIX = process.env.SMOKE_PREFIX || 'map-smoke';

function targetWithCacheBust() {
  const url = new URL(BASE_TARGET);
  url.searchParams.set('rfx_build_check', `${Date.now()}`);
  return url.toString();
}

function assertVisuallyRendered(buffer, name) {
  const png = PNG.sync.read(buffer);
  const colors = new Set();

  const minX = Math.floor(png.width * 0.15);
  const maxX = Math.floor(png.width * 0.85);
  const minY = Math.floor(png.height * 0.15);
  const maxY = Math.floor(png.height * 0.85);

  for (let y = minY; y < maxY; y += 6) {
    for (let x = minX; x < maxX; x += 6) {
      const index = (png.width * y + x) * 4;
      const r = png.data[index];
      const g = png.data[index + 1];
      const b = png.data[index + 2];
      const a = png.data[index + 3];
      if (a < 200) continue;
      colors.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
    }
  }

  if (colors.size < 20) {
    throw new Error(`${name}: screenshot is visually blank/uniform (${colors.size} sampled color bins).`);
  }

  return colors.size;
}

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
    await page.goto(targetWithCacheBust(), { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const buildMarker = await page.locator('meta[name="rfx-build"]').getAttribute('content');
    if (buildMarker !== EXPECTED_BUILD) {
      throw new Error(`${name}: public page is not the expected build. Received ${buildMarker ?? 'no build marker'}.`);
    }

    await page.waitForSelector('.leaflet-container', { state: 'visible', timeout: 20_000 });
    await page.waitForFunction(
      () => document.documentElement.dataset.mapReady === 'true',
      null,
      { timeout: 30_000 },
    );
    await page.waitForSelector('.leaflet-tile-loaded', { state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(1000);

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

    const screenshot = await page.screenshot({ path: `${SCREENSHOT_PREFIX}-${name}.png`, fullPage: true });
    const colorBins = assertVisuallyRendered(screenshot, name);

    console.log(`${name}: expected build visibly rendered with ${state.loadedImages} loaded tile image(s), ${tileResponses} successful tile response(s), and ${colorBins} sampled color bins.`);
  } finally {
    await browser.close();
  }
}

await verify(chromium, 'chromium');
await verify(webkit, 'webkit');
