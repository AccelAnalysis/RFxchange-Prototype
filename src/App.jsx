import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  ArrowRight,
  Box,
  Building2,
  CheckCircle2,
  Crosshair,
  LoaderCircle,
  Lock,
  Mail,
  MapPin,
  Navigation,
  Search,
  ShieldCheck,
  User,
} from 'lucide-react';
import {
  boundsCenter,
  fetchTigerBoundary,
  geographyLabel,
  geometryBounds,
  searchTigerGeographies,
} from './tiger.js';

const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] };

function generateMockMarkers(center, bounds) {
  const longitudeSpan = bounds ? Math.max(bounds[1][0] - bounds[0][0], 0.02) : 0.08;
  const latitudeSpan = bounds ? Math.max(bounds[1][1] - bounds[0][1], 0.02) : 0.08;

  return [
    {
      id: 'm1',
      type: 'platinum',
      label: 'Acme Corp (Platinum)',
      coords: [center[0] - longitudeSpan * 0.12, center[1] + latitudeSpan * 0.08],
    },
    {
      id: 'm2',
      type: 'resource',
      label: 'Economic Development Office',
      coords: [center[0] + longitudeSpan * 0.08, center[1] - latitudeSpan * 0.1],
    },
    {
      id: 'm3',
      type: 'platinum',
      label: 'TechFlow Solutions',
      coords: [center[0] + longitudeSpan * 0.18, center[1] + latitudeSpan * 0.14],
    },
  ];
}

function disableMapInteractions(map) {
  map.boxZoom.disable();
  map.doubleClickZoom.disable();
  map.dragPan.disable();
  map.dragRotate.disable();
  map.keyboard.disable();
  map.scrollZoom.disable();
  map.touchZoomRotate.disable();
}

function enableMapInteractions(map) {
  map.boxZoom.enable();
  map.doubleClickZoom.enable();
  map.dragPan.enable();
  map.dragRotate.enable();
  map.keyboard.enable();
  map.scrollZoom.enable();
  map.touchZoomRotate.enable();
}

function ensureBoundaryLayers(map) {
  if (!map.getSource('selected-geography')) {
    map.addSource('selected-geography', {
      type: 'geojson',
      data: EMPTY_FEATURE_COLLECTION,
    });
  }

  if (!map.getLayer('selected-geography-fill')) {
    map.addLayer({
      id: 'selected-geography-fill',
      type: 'fill',
      source: 'selected-geography',
      paint: {
        'fill-color': '#D6A23A',
        'fill-opacity': 0.13,
      },
    });
  }

  if (!map.getLayer('selected-geography-outline')) {
    map.addLayer({
      id: 'selected-geography-outline',
      type: 'line',
      source: 'selected-geography',
      paint: {
        'line-color': '#F2C661',
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.5, 12, 3.5, 16, 5],
        'line-opacity': 0.96,
      },
    });
  }
}

function ensure3DBuildings(map) {
  if (!map.getSource('openfreemap-3d')) {
    map.addSource('openfreemap-3d', {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '© OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
    });
  }

  if (map.getLayer('rfx-3d-buildings')) return;

  const firstLabelLayer = map.getStyle()?.layers?.find((layer) => layer.type === 'symbol')?.id;

  map.addLayer(
    {
      id: 'rfx-3d-buildings',
      source: 'openfreemap-3d',
      'source-layer': 'building',
      type: 'fill-extrusion',
      minzoom: 13,
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-extrusion-color': [
          'interpolate',
          ['linear'],
          ['coalesce', ['to-number', ['get', 'render_height'], 0], 0],
          0,
          '#24272D',
          80,
          '#3B3F47',
          240,
          '#555B65',
        ],
        'fill-extrusion-height': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13,
          0,
          15,
          ['coalesce', ['to-number', ['get', 'render_height'], 0], ['to-number', ['get', 'height'], 12], 12],
        ],
        'fill-extrusion-base': [
          'coalesce',
          ['to-number', ['get', 'render_min_height'], 0],
          ['to-number', ['get', 'min_height'], 0],
          0,
        ],
        'fill-extrusion-opacity': 0.92,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    firstLabelLayer,
  );
}

function createMarkerElement(type, label) {
  const isPlatinum = type === 'platinum';
  const accent = isPlatinum ? '#D6A23A' : '#2E5EAA';
  const background = isPlatinum ? 'rgba(214,162,58,0.15)' : 'rgba(46,94,170,0.15)';

  const root = document.createElement('div');
  root.className = 'rfx-marker';
  root.setAttribute('role', 'button');
  root.setAttribute('tabindex', '0');
  root.setAttribute('aria-label', label);

  const icon = document.createElement('div');
  icon.className = 'rfx-marker__icon';
  icon.style.background = background;
  icon.style.borderColor = accent;
  icon.style.color = accent;
  icon.innerHTML = isPlatinum
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>';

  const tooltip = document.createElement('div');
  tooltip.className = 'rfx-marker__tooltip';
  tooltip.textContent = label;

  const stem = document.createElement('div');
  stem.className = 'rfx-marker__stem';
  stem.style.backgroundImage = `linear-gradient(to bottom, ${accent}, transparent)`;

  root.append(icon, tooltip, stem);
  return root;
}

export default function App() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    businessName: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    termsAccepted: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [map3DReady, setMap3DReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [boundaryLoadingId, setBoundaryLoadingId] = useState(null);
  const [selectedGeography, setSelectedGeography] = useState(null);
  const [isMapZoomed, setIsMapZoomed] = useState(false);
  const [is3D, setIs3D] = useState(true);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const timersRef = useRef(new Set());
  const boundaryAbortRef = useRef(null);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timersRef.current.clear();
  }, []);

  const schedule = useCallback((callback, delay) => {
    const timerId = window.setTimeout(() => {
      timersRef.current.delete(timerId);
      callback();
    }, delay);
    timersRef.current.add(timerId);
    return timerId;
  }, []);

  const removeMarkers = useCallback(() => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return undefined;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'carto-dark': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors © CARTO',
          },
        },
        layers: [{ id: 'carto-dark-layer', type: 'raster', source: 'carto-dark', minzoom: 0, maxzoom: 22 }],
      },
      center: [-98.5795, 39.8283],
      zoom: 2.5,
      pitch: 35,
      bearing: -8,
      maxPitch: 75,
      interactive: true,
      antialias: true,
      attributionControl: true,
    });

    mapRef.current = map;
    disableMapInteractions(map);

    const handleLoad = () => {
      if (mapRef.current !== map) return;

      try {
        ensureBoundaryLayers(map);
        setMapLoaded(true);
        setMapError('');
      } catch (error) {
        console.error('Map boundary layer initialization failed:', error);
        setMapError('The map loaded, but its geography layer could not be initialized.');
        return;
      }

      try {
        ensure3DBuildings(map);
        setMap3DReady(true);
      } catch (error) {
        console.warn('3D building layer could not be initialized:', error);
        setMap3DReady(false);
      }
    };

    const handleError = (event) => {
      console.warn('MapLibre resource warning:', event?.error ?? event);
      if (!map.loaded()) {
        setMapError('The basemap could not load completely. Check the browser network connection.');
      }
    };

    map.on('load', handleLoad);
    map.on('error', handleError);

    return () => {
      boundaryAbortRef.current?.abort();
      clearTimers();
      removeMarkers();
      map.off('load', handleLoad);
      map.off('error', handleError);
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [clearTimers, removeMarkers]);

  useEffect(() => {
    if (step !== 3 || isMapZoomed) return undefined;

    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchError('');
      setIsSearching(false);
      return undefined;
    }

    const controller = new AbortController();
    const timerId = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError('');
      try {
        const results = await searchTigerGeographies(query, { signal: controller.signal });
        setSearchResults(results);
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.error('TIGERweb geography search failed:', error);
          setSearchError('Census geography search is temporarily unavailable. Please try again.');
          setSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 320);

    return () => {
      window.clearTimeout(timerId);
      controller.abort();
    };
  }, [isMapZoomed, searchQuery, step]);

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData((previous) => ({ ...previous, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleRegisterSubmit = (event) => {
    event.preventDefault();
    if (isSubmitting || !formData.termsAccepted) return;
    setIsSubmitting(true);
    schedule(() => {
      setIsSubmitting(false);
      setStep(2);
    }, 650);
  };

  const addMarkers = useCallback(
    (map, center, bounds) => {
      removeMarkers();
      generateMockMarkers(center, bounds).forEach((markerData, index) => {
        schedule(() => {
          if (mapRef.current !== map || !map.loaded()) return;
          const marker = new maplibregl.Marker({
            element: createMarkerElement(markerData.type, markerData.label),
            anchor: 'bottom',
          })
            .setLngLat(markerData.coords)
            .addTo(map);
          markersRef.current.push(marker);
        }, index * 180);
      });
    },
    [removeMarkers, schedule],
  );

  const selectGeography = async (location) => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.loaded()) {
      setMapError('The map is still loading. Please try the geography again when it is ready.');
      return;
    }

    boundaryAbortRef.current?.abort();
    const controller = new AbortController();
    boundaryAbortRef.current = controller;
    setBoundaryLoadingId(location.id);
    setSearchError('');
    setMapError('');

    try {
      const feature = await fetchTigerBoundary(location, { signal: controller.signal });
      const bounds = geometryBounds(feature.geometry);
      const center = boundsCenter(bounds) ?? location.center;
      if (!bounds || !center) throw new Error('The geography boundary did not contain a usable extent.');

      clearTimers();
      removeMarkers();
      ensureBoundaryLayers(map);
      map.getSource('selected-geography')?.setData({
        type: 'FeatureCollection',
        features: [feature],
      });

      const camera = map.cameraForBounds(bounds, {
        padding: { top: 100, right: 70, bottom: 170, left: 70 },
        maxZoom: 14.5,
      });

      setSelectedGeography({ ...location, center, bounds });
      setSearchQuery('');
      setSearchResults([]);
      setIsMapZoomed(true);
      setIs3D(true);

      map.easeTo({
        center: camera?.center ?? center,
        zoom: Math.min(camera?.zoom ?? 11.5, 14.5),
        pitch: 62,
        bearing: -18,
        duration: 1900,
        essential: true,
      });

      map.once('moveend', () => {
        if (mapRef.current !== map) return;
        addMarkers(map, center, bounds);
        enableMapInteractions(map);
      });
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('Geography boundary selection failed:', error);
        setMapError('That geography was found, but its Census boundary could not be displayed. Try another result.');
      }
    } finally {
      if (!controller.signal.aborted) setBoundaryLoadingId(null);
    }
  };

  const toggle3D = () => {
    const map = mapRef.current;
    if (!map) return;
    setIs3D((previous) => {
      const next = !previous;
      map.easeTo({ pitch: next ? 62 : 0, bearing: next ? -18 : 0, duration: 650, essential: true });
      return next;
    });
  };

  const handleConfirmGeography = () => {
    if (selectedGeography) setStep(4);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0B0B0D] p-4 font-sans text-[#F7F3EA] antialiased">
      <div ref={mapContainerRef} className="absolute inset-0 z-0" aria-label="Interactive 3D business geography map" />

      <div
        className={`pointer-events-none absolute inset-0 z-0 transition-opacity duration-1000 ${
          step === 3 && isMapZoomed
            ? 'opacity-10'
            : 'bg-[radial-gradient(circle_at_center,transparent_0%,#0B0B0D_100%)] opacity-60'
        }`}
      />

      {mapError && (
        <div className="absolute left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 rounded-xl border border-red-400/30 bg-red-950/90 px-4 py-3 text-sm text-red-100 shadow-xl" role="alert">
          {mapError}
        </div>
      )}

      {step === 1 && (
        <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-[32px] border border-[#F7F3EA]/10 bg-[#252932]/70 shadow-[0_0_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl animate-[fadeIn_0.5s_ease-out]">
          <div className="border-b border-[#F7F3EA]/5 px-6 pb-6 pt-10 text-center sm:px-10 sm:pt-12">
            <div className="mb-6 flex items-center justify-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#D6A23A] to-[#a37822] shadow-lg shadow-[#D6A23A]/20">
                <span className="text-xl font-bold tracking-tight text-[#0B0B0D]">RF</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-wide">The <span className="font-light">RF</span>xchange</h1>
            </div>
            <h2 className="mb-2 text-3xl font-medium tracking-tight">Activate your network.</h2>
            <p className="mx-auto max-w-sm text-sm text-[#F7F3EA]/60">Create your business account, then place the organization in its primary geography.</p>
          </div>

          <form onSubmit={handleRegisterSubmit} className="space-y-5 px-6 py-8 sm:px-10">
            <Field label="Business Name" icon={<Building2 size={18} />}>
              <input type="text" name="businessName" required autoComplete="organization" value={formData.businessName} onChange={handleInputChange} className="rfx-input pl-11" placeholder="Acme Industries LLC" />
            </Field>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="First Name" icon={<User size={18} />}>
                <input type="text" name="firstName" required autoComplete="given-name" value={formData.firstName} onChange={handleInputChange} className="rfx-input pl-11" placeholder="Jane" />
              </Field>
              <Field label="Last Name">
                <input type="text" name="lastName" required autoComplete="family-name" value={formData.lastName} onChange={handleInputChange} className="rfx-input px-4" placeholder="Doe" />
              </Field>
            </div>

            <Field label="Work Email" icon={<Mail size={18} />}>
              <input type="email" name="email" required autoComplete="email" value={formData.email} onChange={handleInputChange} className="rfx-input pl-11" placeholder="jane@acme.com" />
            </Field>

            <Field label="Password" icon={<Lock size={18} />}>
              <input type="password" name="password" required minLength={8} autoComplete="new-password" value={formData.password} onChange={handleInputChange} className="rfx-input pl-11" placeholder="At least 8 characters" />
            </Field>

            <label className="group flex cursor-pointer items-start gap-3 pb-4 pt-2">
              <span className="relative mt-0.5 flex items-center justify-center">
                <input type="checkbox" name="termsAccepted" required checked={formData.termsAccepted} onChange={handleInputChange} className="peer sr-only" />
                <span className="flex h-5 w-5 items-center justify-center rounded-md border-2 border-[#F7F3EA]/30 bg-[#0B0B0D]/50 transition-colors group-hover:border-[#D6A23A]/70 peer-checked:border-[#D6A23A] peer-checked:bg-[#D6A23A]">
                  {formData.termsAccepted && <ShieldCheck size={14} className="text-[#0B0B0D]" />}
                </span>
              </span>
              <span className="text-sm leading-relaxed text-[#F7F3EA]/70">I acknowledge the Terms of Service and Privacy Policy.</span>
            </label>

            <button type="submit" disabled={!formData.termsAccepted || isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#D6A23A] to-[#b88a31] py-4 font-semibold text-[#0B0B0D] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(214,162,58,0.3)] disabled:cursor-not-allowed disabled:opacity-50">
              {isSubmitting ? <><LoaderCircle size={18} className="animate-spin" />Creating account...</> : <>Continue<ArrowRight size={18} className="stroke-[2.5px]" /></>}
            </button>
          </form>
        </div>
      )}

      {step === 2 && (
        <div className="relative z-10 w-full max-w-lg rounded-[32px] border border-[#D6A23A]/30 bg-[#252932]/70 p-8 text-center shadow-[0_0_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl animate-[fadeIn_0.5s_ease-out] sm:p-10">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-[#D6A23A]/50 bg-[#D6A23A]/10 shadow-inner"><MapPin size={32} className="text-[#D6A23A]" /></div>
          <h2 className="mb-4 text-3xl font-semibold tracking-tight">Welcome to The RFxchange.</h2>
          <p className="mb-10 text-lg leading-relaxed text-[#F7F3EA]/80">Place your business on the Exchange so customers, partners, resources, and opportunities can find it.</p>
          <button type="button" onClick={() => setStep(3)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D6A23A] py-4 font-semibold text-[#0B0B0D] shadow-lg shadow-[#D6A23A]/20 transition-all hover:-translate-y-0.5 hover:bg-[#e4b553]">
            Add My Business<Navigation size={18} />
          </button>
        </div>
      )}

      {step === 3 && !isMapZoomed && (
        <div className="absolute left-1/2 top-8 z-20 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2">
          <div className="rounded-[32px] border border-[#F7F3EA]/20 bg-[#252932]/88 p-6 shadow-2xl backdrop-blur-2xl animate-[slideDown_0.5s_ease-out] sm:p-8">
            <h2 className="mb-2 text-center text-2xl font-semibold">Where does your business operate?</h2>
            <p className="mb-2 text-center text-sm text-[#F7F3EA]/60">Search any U.S. city, county, ZIP Code Tabulation Area, locality, or metro area.</p>
            <p className="mb-6 text-center text-xs text-[#D6A23A]/85">Live Census TIGERweb search — no preset geography list.</p>

            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-5">
                {isSearching ? <LoaderCircle size={20} className="animate-spin text-[#D6A23A]" /> : <Search size={20} className="text-[#D6A23A]" />}
              </div>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                disabled={!mapLoaded}
                className="w-full rounded-2xl border-2 border-[#D6A23A]/30 bg-[#0B0B0D]/80 py-4 pl-14 pr-6 text-lg text-[#F7F3EA] shadow-inner transition-all placeholder:text-[#F7F3EA]/40 focus:border-[#D6A23A] focus:outline-none focus:ring-4 focus:ring-[#D6A23A]/20 disabled:cursor-wait disabled:opacity-60"
                placeholder={mapLoaded ? 'e.g. Portsmouth VA, Cook County IL, 90210...' : 'Loading map...'}
                autoFocus
              />

              {(searchResults.length > 0 || searchError || (searchQuery.trim().length >= 2 && !isSearching)) && (
                <div className="absolute left-0 right-0 top-full z-30 mt-3 max-h-[22rem] overflow-y-auto rounded-2xl border border-[#F7F3EA]/10 bg-[#252932]/97 shadow-2xl backdrop-blur-xl">
                  {searchResults.map((location) => (
                    <button
                      type="button"
                      key={location.id}
                      onClick={() => selectGeography(location)}
                      disabled={Boolean(boundaryLoadingId)}
                      className="group flex w-full items-center gap-4 border-b border-[#F7F3EA]/5 px-5 py-3.5 text-left transition-colors hover:bg-[#D6A23A]/10 disabled:cursor-wait disabled:opacity-65"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0B0B0D]/50 text-[#F7F3EA]/40 transition-colors group-hover:text-[#D6A23A]">
                        {boundaryLoadingId === location.id ? <LoaderCircle size={18} className="animate-spin text-[#D6A23A]" /> : <MapPin size={18} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold">{geographyLabel(location)}</span>
                        <span className="block text-sm text-[#F7F3EA]/50">{location.type} · {location.vintage}</span>
                      </span>
                    </button>
                  ))}
                  {!isSearching && searchResults.length === 0 && !searchError && (
                    <div className="px-5 py-4 text-sm text-[#F7F3EA]/60">No matching Census geography found. Try a place name, county, state abbreviation, or 5-digit ZIP.</div>
                  )}
                  {searchError && <div className="px-5 py-4 text-sm text-red-200">{searchError}</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 3 && isMapZoomed && selectedGeography && (
        <>
          <button
            type="button"
            onClick={toggle3D}
            className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-xl border border-[#F7F3EA]/15 bg-[#252932]/88 px-4 py-2.5 text-sm font-semibold text-[#F7F3EA] backdrop-blur-xl transition hover:border-[#D6A23A]/60 hover:bg-[#252932]"
            aria-pressed={is3D}
          >
            <Box size={17} className={is3D ? 'text-[#D6A23A]' : 'text-[#F7F3EA]/50'} />
            {is3D ? '3D' : '2D'}
          </button>

          <div className="absolute bottom-6 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 flex-col items-stretch gap-5 rounded-[32px] border border-[#D6A23A]/50 bg-[#252932]/92 px-6 py-5 shadow-[0_20px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl animate-[slideUp_0.5s_ease-out_1.6s_both] sm:bottom-10 sm:flex-row sm:items-center sm:gap-6 sm:px-8">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F7F3EA]/60"><Crosshair size={12} className="text-[#D6A23A]" />Selected Geography</div>
              <div className="truncate text-2xl font-bold text-[#F7F3EA]">{geographyLabel(selectedGeography)}</div>
              <div className="mt-1 text-xs text-[#F7F3EA]/50">Boundary: U.S. Census TIGERweb · {map3DReady ? '3D buildings active' : '3D camera active'}</div>
            </div>
            <div className="hidden h-12 w-px bg-[#F7F3EA]/20 sm:block" />
            <button type="button" onClick={handleConfirmGeography} className="whitespace-nowrap rounded-xl bg-[#D6A23A] px-6 py-3 font-bold text-[#0B0B0D] transition-all hover:-translate-y-0.5 hover:bg-[#e4b553] hover:shadow-[0_0_20px_rgba(214,162,58,0.4)]">Confirm & Continue</button>
          </div>
        </>
      )}

      {step === 4 && selectedGeography && (
        <div className="relative z-20 w-full max-w-lg rounded-[32px] border border-[#D6A23A]/40 bg-[#252932]/85 p-10 text-center shadow-[0_0_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl animate-[fadeIn_0.5s_ease-out]">
          <CheckCircle2 size={54} className="mx-auto mb-5 text-[#D6A23A]" />
          <h2 className="mb-3 text-3xl font-semibold">Business geography saved.</h2>
          <p className="text-[#F7F3EA]/70">{formData.businessName || 'Your business'} is now centered in {geographyLabel(selectedGeography)}.</p>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .rfx-input { width: 100%; border: 1px solid rgb(247 243 234 / 0.1); border-radius: 1rem; background: rgb(11 11 13 / 0.5); padding-top: 0.875rem; padding-bottom: 0.875rem; padding-right: 1rem; color: #F7F3EA; box-shadow: inset 0 2px 4px rgb(0 0 0 / 0.2); transition: border-color 150ms, box-shadow 150ms; }
        .rfx-input::placeholder { color: rgb(247 243 234 / 0.3); }
        .rfx-input:focus { outline: none; border-color: rgb(214 162 58 / 0.5); box-shadow: 0 0 0 1px rgb(214 162 58 / 0.5); }
        .rfx-marker { position: relative; display: flex; cursor: pointer; flex-direction: column; align-items: center; animation: slideUp 0.5s ease-out both; }
        .rfx-marker__icon { display: flex; width: 2.5rem; height: 2.5rem; align-items: center; justify-content: center; border-width: 1px; border-radius: 1rem; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.35); backdrop-filter: blur(12px); transition: transform 150ms; }
        .rfx-marker:hover .rfx-marker__icon, .rfx-marker:focus .rfx-marker__icon { transform: scale(1.1); }
        .rfx-marker__tooltip { pointer-events: none; position: absolute; top: 3rem; white-space: nowrap; border: 1px solid rgb(247 243 234 / 0.1); border-radius: 9999px; background: rgb(11 11 13 / 0.9); padding: 0.375rem 0.75rem; color: #F7F3EA; font-size: 11px; opacity: 0; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.35); backdrop-filter: blur(8px); transition: opacity 150ms; }
        .rfx-marker:hover .rfx-marker__tooltip, .rfx-marker:focus .rfx-marker__tooltip { opacity: 1; }
        .rfx-marker__stem { width: 1px; height: 2rem; margin-top: 0.25rem; }
        .maplibregl-ctrl-attrib { background: rgb(11 11 13 / 0.72) !important; color: rgb(247 243 234 / 0.72) !important; }
        .maplibregl-ctrl-attrib a { color: #D6A23A !important; }
      `}</style>
    </div>
  );
}

function Field({ label, icon, children }) {
  return (
    <div className="space-y-1.5">
      <label className="ml-1 text-xs font-medium uppercase tracking-wider text-[#F7F3EA]/70">{label}</label>
      <div className="group relative">
        {icon && <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[#F7F3EA]/40 transition-colors group-focus-within:text-[#D6A23A]">{icon}</div>}
        {children}
      </div>
    </div>
  );
}
