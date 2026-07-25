import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css';

const BASEMAP_TILES = [
  'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
  'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
  'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
  'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
];

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: BASEMAP_TILES,
        tileSize: 256,
        maxzoom: 22,
        attribution: '© OpenStreetMap contributors © CARTO',
      },
    },
    layers: [
      {
        id: 'basemap',
        type: 'raster',
        source: 'basemap',
      },
    ],
  },
  center: [-76.2983, 36.8354],
  zoom: 15.4,
  pitch: 62,
  bearing: -18,
  maxPitch: 80,
  antialias: true,
  attributionControl: true,
});

map.addControl(
  new maplibregl.NavigationControl({
    visualizePitch: true,
  }),
  'top-right',
);

map.on('load', () => {
  map.resize();

  try {
    map.addSource('openfreemap-buildings', {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '© OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
    });

    map.addLayer({
      id: '3d-buildings',
      type: 'fill-extrusion',
      source: 'openfreemap-buildings',
      'source-layer': 'building',
      minzoom: 13,
      paint: {
        'fill-extrusion-color': '#3a3f47',
        'fill-extrusion-height': [
          'coalesce',
          ['to-number', ['get', 'render_height']],
          ['to-number', ['get', 'height']],
          12,
        ],
        'fill-extrusion-base': [
          'coalesce',
          ['to-number', ['get', 'render_min_height']],
          ['to-number', ['get', 'min_height']],
          0,
        ],
        'fill-extrusion-opacity': 0.92,
        'fill-extrusion-vertical-gradient': true,
      },
    });
  } catch (error) {
    console.error('3D building layer could not be added:', error);
  }
});

map.on('error', (event) => {
  console.error('MapLibre resource error:', event?.error ?? event);
});

const resizeMap = () => map.resize();
window.addEventListener('resize', resizeMap);

if ('ResizeObserver' in window) {
  const observer = new ResizeObserver(resizeMap);
  observer.observe(document.getElementById('map'));
}
