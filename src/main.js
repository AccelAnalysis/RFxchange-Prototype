import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './index.css';

// Keep the 2D baseline on the simplest rendering path possible for Safari/WebKit.
// Leaflet otherwise uses CSS 3D transforms when the browser advertises support.
L.Browser.any3d = false;
L.Browser.webkit3d = false;

const map = L.map('map', {
  center: [36.8354, -76.2983],
  zoom: 12,
  zoomControl: true,
  attributionControl: true,
  fadeAnimation: false,
  zoomAnimation: false,
  markerZoomAnimation: false,
});

const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
  updateWhenIdle: true,
  keepBuffer: 2,
});

tiles.on('load', () => {
  document.documentElement.dataset.mapReady = 'true';
});

tiles.on('tileerror', (event) => {
  console.error('Map tile failed to load:', event?.error ?? event);
});

tiles.addTo(map);

requestAnimationFrame(() => map.invalidateSize(false));
window.addEventListener('resize', () => map.invalidateSize(false));
