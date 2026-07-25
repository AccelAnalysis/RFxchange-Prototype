import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './index.css';

const BUILD_ID = 'leaflet-mobile-recovery-2026-07-25-1';
const FALLBACK_DELAY_MS = 7000;

const providers = [
  {
    id: 'osm',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  {
    id: 'carto',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    options: {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    },
  },
];

document.documentElement.dataset.mapBuild = BUILD_ID;

const status = document.getElementById('map-status');

function showFailure(message) {
  document.documentElement.dataset.mapFailed = 'true';
  if (!status) return;
  status.textContent = message;
  status.hidden = false;
}

function clearFailure() {
  delete document.documentElement.dataset.mapFailed;
  if (!status) return;
  status.hidden = true;
  status.textContent = '';
}

const map = L.map('map', {
  center: [36.8354, -76.2983],
  zoom: 12,
  zoomControl: true,
  attributionControl: true,
  fadeAnimation: false,
  zoomAnimation: false,
  markerZoomAnimation: false,
  preferCanvas: false,
});

let activeLayer = null;
let activeProviderIndex = -1;
let mapReady = false;
let fallbackTimer = null;

function markReady(providerId) {
  if (mapReady) return;
  mapReady = true;
  clearTimeout(fallbackTimer);
  clearFailure();
  document.documentElement.dataset.mapReady = 'true';
  document.documentElement.dataset.mapProvider = providerId;
}

function mountProvider(index) {
  if (index < 0 || index >= providers.length) {
    showFailure('The basemap could not be loaded. Check the network connection and reload the page.');
    return;
  }

  activeProviderIndex = index;
  const provider = providers[index];
  let tileErrors = 0;

  if (activeLayer) {
    activeLayer.off();
    map.removeLayer(activeLayer);
  }

  const layer = L.tileLayer(provider.url, {
    ...provider.options,
    updateWhenIdle: true,
    keepBuffer: 2,
  });

  activeLayer = layer;

  layer.on('tileload', () => {
    if (activeLayer !== layer) return;
    markReady(provider.id);
  });

  layer.on('tileerror', (event) => {
    if (activeLayer !== layer || mapReady) return;
    tileErrors += 1;
    console.warn(`Map tile failed from ${provider.id}:`, event?.error ?? event);
    if (tileErrors >= 3) mountProvider(index + 1);
  });

  layer.addTo(map);

  clearTimeout(fallbackTimer);
  fallbackTimer = window.setTimeout(() => {
    if (!mapReady && activeLayer === layer) mountProvider(index + 1);
  }, FALLBACK_DELAY_MS);
}

mountProvider(0);

function refreshMapSize() {
  map.invalidateSize(false);
}

requestAnimationFrame(refreshMapSize);
window.setTimeout(refreshMapSize, 250);
window.addEventListener('resize', refreshMapSize, { passive: true });
window.addEventListener('orientationchange', () => window.setTimeout(refreshMapSize, 150), { passive: true });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) window.setTimeout(refreshMapSize, 50);
});

window.addEventListener('online', () => {
  if (!mapReady) mountProvider(Math.max(activeProviderIndex, 0));
});
