import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './index.css';

const map = L.map('map', {
  center: [36.8354, -76.2983],
  zoom: 12,
  zoomControl: true,
  attributionControl: true,
  preferCanvas: false,
});

const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
  crossOrigin: true,
});

tiles.on('load', () => {
  document.documentElement.dataset.mapReady = 'true';
});

tiles.on('tileerror', (event) => {
  console.error('Map tile failed to load:', event?.error ?? event);
});

tiles.addTo(map);

requestAnimationFrame(() => map.invalidateSize());
window.addEventListener('resize', () => map.invalidateSize());
