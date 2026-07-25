import { chromium, webkit } from 'playwright';
import { PNG } from 'pngjs';

const BASE_TARGET = process.env.MAP_URL || 'http://127.0.0.1:4173/RFxchange-Prototype/';
const EXPECTED_BUILD = 'rfx-current-static-2026-07-25-1';
const SCREENSHOT_PREFIX = process.env.SMOKE_PREFIX || 'map-smoke';

function targetWithCacheBust() {
  const url = new URL(BASE_TARGET);
  url.searchParams.set('rfx_build_check', `${EXPECTED_BUILD}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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

function isBasemapUrl(url) {
  return url.includes('tile.openstreetmap.org') || url.includes('basemaps.cartocdn.com');
}

async function verify(browserType, name, contextOptions) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const pageErrors = [];
  let tileResponses = 0;

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (isBasemapUrl(response.url()) && response.ok()) tileResponses += 1;
  });

  try {
    await page.goto(targetWithCacheBust(), { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const buildMarker = await page.locator('meta[name="rfx-build"]').getAttribute('content');
    if (buildMarker !== EXPECTED_BUILD) {
      throw new Error(`${name}: public page is not the expected build. Received ${buildMarker ?? 'no build marker'}.`);
    }

    const deploymentMode = await page.locator('meta[name="rfx-deployment-mode"]').getAttribute('content');
    if (deploymentMode !== 'static-root-and-actions') {
      throw new Error(`${name}: public page is not the static unified deployment. Received ${deploymentMode ?? 'no deployment marker'}.`);
    }

    const staleRuntimeScripts = await page.locator('script[src*="/src/"], script[src*="maplibre"], script[src*="assets/index-"]').count();
    if (staleRuntimeScripts > 0) {
      throw new Error(`${name}: stale runtime script references are still present.`);
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
        provider: document.documentElement.dataset.mapProvider || '',
        failed: document.documentElement.dataset.mapFailed === 'true',
        build: document.documentElement.dataset.rfxBuild || '',
      };
    });

    if (state.build !== EXPECTED_BUILD) throw new Error(`${name}: document build dataset is stale.`);
    if (state.width < 300 || state.height < 300) throw new Error(`${name}: map container has unusable dimensions.`);
    if (state.tileCount === 0 || state.loadedImages === 0) throw new Error(`${name}: no visible map tiles loaded.`);
    if (tileResponses === 0) throw new Error(`${name}: no successful basemap tile responses observed.`);
    if (!['osm', 'carto'].includes(state.provider)) throw new Error(`${name}: no recognized basemap provider reached ready state.`);
    if (state.failed) throw new Error(`${name}: map entered its visible failure state.`);
    if (pageErrors.length > 0) throw new Error(`${name}: browser page error: ${pageErrors.join(' | ')}`);

    const screenshot = await page.screenshot({ path: `${SCREENSHOT_PREFIX}-${name}.png`, fullPage: true });
    const colorBins = assertVisuallyRendered(screenshot, name);

    console.log(`${name}: ${state.provider} visibly rendered ${EXPECTED_BUILD} with ${state.loadedImages} loaded tile image(s), ${tileResponses} successful tile response(s), and ${colorBins} sampled color bins.`);
  } finally {
    await context.close();
    await browser.close();
  }
}

await verify(chromium, 'chromium-desktop', {
  viewport: { width: 1440, height: 900 },
});

await verify(webkit, 'webkit-desktop', {
  viewport: { width: 1440, height: 900 },
});

await verify(webkit, 'webkit-iphone', {
  viewport: { width: 430, height: 932 },
  screen: { width: 430, height: 932 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
});
