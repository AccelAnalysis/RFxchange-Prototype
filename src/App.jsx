import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  ArrowRight,
  Box,
  Building2,
  Crosshair,
  LoaderCircle,
  Lock,
  Mail,
  MapPin,
  Navigation,
  Search,
  ShieldCheck,
  User,
  Users,
  Landmark,
  BriefcaseBusiness,
} from 'lucide-react';
import {
  boundsCenter,
  fetchTigerBoundary,
  geographyLabel,
  geometryBounds,
  searchTigerGeographies,
} from './tiger.js';
import {
  buildMockEnvironmentMarkers,
  canonicalOnboardingGeography,
  createOutsideMaskFeature,
  createPrototypeEntitlement,
  entitlementAllows,
  validateFeatureIdentity,
} from './environment.js';

const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] };

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

function ensureEnvironmentLayers(map) {
  if (!map.getSource('outside-selected-geography')) {
    map.addSource('outside-selected-geography', { type: 'geojson', data: EMPTY_FEATURE_COLLECTION });
  }

  if (!map.getLayer('outside-selected-geography-fill')) {
    map.addLayer({
      id: 'outside-selected-geography-fill',
      type: 'fill',
      source: 'outside-selected-geography',
      paint: {
        'fill-color': '#08090B',
        'fill-opacity': 0.76,
      },
    });
  }

  if (!map.getSource('selected-geography')) {
    map.addSource('selected-geography', { type: 'geojson', data: EMPTY_FEATURE_COLLECTION });
  }

  if (!map.getLayer('selected-geography-fill')) {
    map.addLayer({
      id: 'selected-geography-fill',
      type: 'fill',
      source: 'selected-geography',
      paint: {
        'fill-color': '#D6A23A',
        'fill-opacity': 0.12,
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
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.75, 12, 3.75, 16, 5],
        'line-opacity': 0.98,
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

function createMarkerElement(kind, label) {
  const isPlatinum = kind === 'platinum';
  const accent = isPlatinum ? '#D6A23A' : '#5EA4FF';
  const background = isPlatinum ? 'rgba(214,162,58,0.18)' : 'rgba(46,94,170,0.24)';

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
    : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M6 18V8"/><path d="M10 18V8"/><path d="M14 18V8"/><path d="M18 18V8"/><path d="m4 8 8-5 8 5"/></svg>';

  const tooltip = document.createElement('div');
  tooltip.className = 'rfx-marker__tooltip';
  tooltip.textContent = label;

  const stem = document.createElement('div');
  stem.className = 'rfx-marker__stem';
  stem.style.backgroundImage = `linear-gradient(to bottom, ${accent}, transparent)`;

  root.append(icon, tooltip, stem);
  return root;
}

function cameraForGeography(map, bounds, center, is3D = true) {
  const camera = map.cameraForBounds(bounds, {
    padding: { top: 120, right: 80, bottom: 170, left: 80 },
    maxZoom: 14.5,
  });

  return {
    center: camera?.center ?? center,
    zoom: Math.min(camera?.zoom ?? 11.5, 14.5),
    pitch: is3D ? 62 : 0,
    bearing: is3D ? -18 : 0,
  };
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
  const [onboardingState, setOnboardingState] = useState({
    account: null,
    selectedGeography: null,
    geographyStatus: 'unselected',
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
  const [previewGeography, setPreviewGeography] = useState(null);
  const [environmentActive, setEnvironmentActive] = useState(false);
  const [environmentQuery, setEnvironmentQuery] = useState('');
  const [is3D, setIs3D] = useState(true);
  const [isEnteringEnvironment, setIsEnteringEnvironment] = useState(false);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const timersRef = useRef(new Set());
  const boundaryAbortRef = useRef(null);
  const entitlementRef = useRef(null);

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

  const showEnvironmentMarkers = useCallback((map, geography, query = '') => {
    removeMarkers();
    if (!geography) return;

    const normalized = query.trim().toLowerCase();
    const markers = buildMockEnvironmentMarkers(geography.center, geography.bounds)
      .filter((marker) => !normalized || marker.label.toLowerCase().includes(normalized));

    markers.forEach((markerData, index) => {
      schedule(() => {
        if (mapRef.current !== map || !map.loaded()) return;
        const marker = new maplibregl.Marker({
          element: createMarkerElement(markerData.kind, markerData.label),
          anchor: 'bottom',
        })
          .setLngLat(markerData.coords)
          .addTo(map);
        markersRef.current.push(marker);
      }, index * 140);
    });
  }, [removeMarkers, schedule]);

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
        ensureEnvironmentLayers(map);
        setMapLoaded(true);
        setMapError('');
      } catch (error) {
        console.error('Map environment layer initialization failed:', error);
        setMapError('The map loaded, but its geography layers could not be initialized.');
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
      if (!map.loaded()) setMapError('The basemap could not load completely. Check the browser network connection.');
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
    if (step !== 3 || previewGeography) return undefined;

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
  }, [previewGeography, searchQuery, step]);

  useEffect(() => {
    if (!environmentActive) return;
    const map = mapRef.current;
    const entitlement = entitlementRef.current;
    if (!map || !entitlement) return;
    showEnvironmentMarkers(map, entitlement.geography, environmentQuery);
  }, [environmentActive, environmentQuery, showEnvironmentMarkers]);

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData((previous) => ({ ...previous, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleRegisterSubmit = (event) => {
    event.preventDefault();
    if (isSubmitting || !formData.termsAccepted) return;
    setIsSubmitting(true);
    schedule(() => {
      setOnboardingState((previous) => ({
        ...previous,
        account: {
          businessName: formData.businessName,
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
        },
      }));
      setIsSubmitting(false);
      setStep(2);
    }, 650);
  };

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
      validateFeatureIdentity(location, feature);

      const bounds = geometryBounds(feature.geometry);
      const center = boundsCenter(bounds) ?? location.center;
      if (!bounds || !center) throw new Error('The geography boundary did not contain a usable extent.');

      const canonical = canonicalOnboardingGeography(location, feature, center, bounds);
      const entitlement = createPrototypeEntitlement(canonical, feature);
      const mask = createOutsideMaskFeature(feature.geometry);

      clearTimers();
      removeMarkers();
      ensureEnvironmentLayers(map);
      map.getSource('selected-geography')?.setData({ type: 'FeatureCollection', features: [feature] });
      map.getSource('outside-selected-geography')?.setData(
        mask ? { type: 'FeatureCollection', features: [mask] } : EMPTY_FEATURE_COLLECTION,
      );

      entitlementRef.current = entitlement;
      setOnboardingState((previous) => ({
        ...previous,
        selectedGeography: canonical,
        geographyStatus: 'validated',
      }));
      setPreviewGeography(canonical);
      setSearchQuery('');
      setSearchResults([]);
      setIs3D(true);

      map.easeTo({
        ...cameraForGeography(map, bounds, center, true),
        duration: 1900,
        essential: true,
      });
      map.once('moveend', () => {
        if (mapRef.current === map) enableMapInteractions(map);
      });
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('Geography validation failed:', error);
        entitlementRef.current = null;
        setOnboardingState((previous) => ({ ...previous, selectedGeography: null, geographyStatus: 'invalid' }));
        setMapError('That geography could not be validated against Census TIGERweb. Choose another search result.');
      }
    } finally {
      if (!controller.signal.aborted) setBoundaryLoadingId(null);
    }
  };

  const handleChangeGeography = () => {
    const map = mapRef.current;
    entitlementRef.current = null;
    setPreviewGeography(null);
    setEnvironmentActive(false);
    setEnvironmentQuery('');
    setOnboardingState((previous) => ({ ...previous, selectedGeography: null, geographyStatus: 'unselected' }));
    removeMarkers();
    if (map?.loaded()) {
      map.getSource('selected-geography')?.setData(EMPTY_FEATURE_COLLECTION);
      map.getSource('outside-selected-geography')?.setData(EMPTY_FEATURE_COLLECTION);
      disableMapInteractions(map);
      map.easeTo({ center: [-98.5795, 39.8283], zoom: 2.5, pitch: 35, bearing: -8, duration: 900 });
    }
  };

  const handleEnterEnvironment = async () => {
    const map = mapRef.current;
    const entitlement = entitlementRef.current;
    const selected = onboardingState.selectedGeography;
    if (!map || !entitlement || !selected || !entitlementAllows(entitlement, selected)) {
      setMapError('Geography authorization is missing or no longer matches onboarding. Select the geography again.');
      return;
    }

    setIsEnteringEnvironment(true);
    setMapError('');
    try {
      const feature = await fetchTigerBoundary(entitlement.geography);
      validateFeatureIdentity(entitlement.geography, feature);

      if (!entitlementAllows(entitlement, onboardingState.selectedGeography)) {
        throw new Error('The selected geography changed after validation.');
      }

      setOnboardingState((previous) => ({ ...previous, geographyStatus: 'authorized' }));
      setEnvironmentActive(true);
      setStep(4);
      setEnvironmentQuery('');
      showEnvironmentMarkers(map, entitlement.geography, '');
      map.easeTo({
        ...cameraForGeography(map, entitlement.geography.bounds, entitlement.geography.center, true),
        duration: 1000,
        essential: true,
      });
      enableMapInteractions(map);
    } catch (error) {
      console.error('Controlled environment authorization failed:', error);
      setMapError('The selected geography could not be revalidated for environment access. Select it again.');
      setOnboardingState((previous) => ({ ...previous, geographyStatus: 'invalid' }));
      entitlementRef.current = null;
    } finally {
      setIsEnteringEnvironment(false);
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

  const geographyName = previewGeography ? geographyLabel(previewGeography) : '';

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0B0B0D] p-4 font-sans text-[#F7F3EA] antialiased">
      <div ref={mapContainerRef} className="absolute inset-0 z-0" aria-label="Interactive 3D RFxchange geography map" />

      <div
        className={`pointer-events-none absolute inset-0 z-0 transition-opacity duration-1000 ${
          step >= 3 && previewGeography
            ? 'opacity-[0.06]'
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
            <p className="mx-auto max-w-sm text-sm text-[#F7F3EA]/60">Create your business account, then establish its primary RFxchange locality.</p>
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
          <p className="mb-10 text-lg leading-relaxed text-[#F7F3EA]/80">Choose your primary locality. It becomes the controlled map environment where your business begins participating.</p>
          <button type="button" onClick={() => setStep(3)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D6A23A] py-4 font-semibold text-[#0B0B0D] shadow-lg shadow-[#D6A23A]/20 transition-all hover:-translate-y-0.5 hover:bg-[#e4b553]">
            Choose My Locality<Navigation size={18} />
          </button>
        </div>
      )}

      {step === 3 && !previewGeography && (
        <div className="absolute left-1/2 top-8 z-20 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2">
          <div className="rounded-[32px] border border-[#F7F3EA]/20 bg-[#252932]/88 p-6 shadow-2xl backdrop-blur-2xl animate-[slideDown_0.5s_ease-out] sm:p-8">
            <h2 className="mb-2 text-center text-2xl font-semibold">Choose your RFxchange locality</h2>
            <p className="mb-2 text-center text-sm text-[#F7F3EA]/60">Search any U.S. city, county, ZIP Code Tabulation Area, locality, or metro area.</p>
            <p className="mb-6 text-center text-xs text-[#D6A23A]/85">Selections are validated against live Census TIGERweb boundaries.</p>

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

      {step === 3 && previewGeography && (
        <>
          <button type="button" onClick={toggle3D} className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-xl border border-[#F7F3EA]/15 bg-[#252932]/88 px-4 py-2.5 text-sm font-semibold text-[#F7F3EA] backdrop-blur-xl transition hover:border-[#D6A23A]/60 hover:bg-[#252932]" aria-pressed={is3D}>
            <Box size={17} className={is3D ? 'text-[#D6A23A]' : 'text-[#F7F3EA]/50'} />{is3D ? '3D' : '2D'}
          </button>

          <div className="absolute bottom-6 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 flex-col items-stretch gap-5 rounded-[32px] border border-[#D6A23A]/50 bg-[#252932]/92 px-6 py-5 shadow-[0_20px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl animate-[slideUp_0.5s_ease-out_1.4s_both] md:flex-row md:items-center md:gap-6 md:px-8">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F7F3EA]/60"><ShieldCheck size={13} className="text-[#D6A23A]" />Validated locality</div>
              <div className="truncate text-2xl font-bold text-[#F7F3EA]">{geographyName}</div>
              <div className="mt-1 text-xs text-[#F7F3EA]/50">Census boundary loaded · Outside territory muted · {map3DReady ? '3D buildings active' : '3D camera active'}</div>
            </div>
            <div className="hidden h-12 w-px bg-[#F7F3EA]/20 md:block" />
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={handleChangeGeography} className="rounded-xl border border-[#F7F3EA]/20 px-5 py-3 font-semibold text-[#F7F3EA] transition hover:bg-[#F7F3EA]/5">Change</button>
              <button type="button" onClick={handleEnterEnvironment} disabled={isEnteringEnvironment} className="flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#D6A23A] px-6 py-3 font-bold text-[#0B0B0D] transition hover:-translate-y-0.5 hover:bg-[#e4b553] disabled:cursor-wait disabled:opacity-60">
                {isEnteringEnvironment ? <><LoaderCircle size={17} className="animate-spin" />Authorizing...</> : <>Enter RFxchange<ArrowRight size={17} /></>}
              </button>
            </div>
          </div>
        </>
      )}

      {step === 4 && environmentActive && previewGeography && (
        <>
          <div className="absolute left-4 right-4 top-4 z-20 flex flex-col gap-3 md:left-6 md:right-6 md:flex-row md:items-center">
            <div className="flex items-center gap-3 rounded-2xl border border-[#D6A23A]/35 bg-[#17191E]/90 px-4 py-3 backdrop-blur-xl">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D6A23A] font-bold text-[#0B0B0D]">RF</div>
              <div className="min-w-0">
                <div className="truncate font-semibold">{geographyName}</div>
                <div className="text-xs text-[#F7F3EA]/55">Controlled RFxchange locality</div>
              </div>
            </div>

            <div className="relative flex-1">
              <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#D6A23A]" />
              <input
                type="search"
                value={environmentQuery}
                onChange={(event) => setEnvironmentQuery(event.target.value)}
                className="w-full rounded-2xl border border-[#F7F3EA]/15 bg-[#17191E]/90 py-3.5 pl-11 pr-4 text-[#F7F3EA] backdrop-blur-xl placeholder:text-[#F7F3EA]/35 focus:border-[#D6A23A]/70 focus:outline-none focus:ring-2 focus:ring-[#D6A23A]/15"
                placeholder="Search Platinum businesses and official resources in this locality..."
              />
            </div>

            <button type="button" onClick={toggle3D} className="flex items-center justify-center gap-2 rounded-xl border border-[#F7F3EA]/15 bg-[#17191E]/90 px-4 py-3.5 text-sm font-semibold backdrop-blur-xl" aria-pressed={is3D}>
              <Box size={17} className={is3D ? 'text-[#D6A23A]' : 'text-[#F7F3EA]/50'} />{is3D ? '3D' : '2D'}
            </button>
          </div>

          <div className="absolute bottom-5 left-4 z-20 w-[calc(100%-2rem)] max-w-sm rounded-[28px] border border-[#F7F3EA]/12 bg-[#17191E]/92 p-5 backdrop-blur-2xl md:bottom-6 md:left-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D6A23A]">RFxchange</div>
                <h2 className="mt-1 text-xl font-semibold">Local network</h2>
              </div>
              <span className="rounded-full border border-[#D6A23A]/30 bg-[#D6A23A]/10 px-3 py-1 text-xs font-semibold text-[#D6A23A]">Authorized</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Action icon={<Users size={17} />} label="Connections" />
              <Action icon={<Landmark size={17} />} label="Resources" />
              <Action icon={<BriefcaseBusiness size={17} />} label="Opportunities" />
            </div>

            <div className="mt-4 border-t border-[#F7F3EA]/10 pt-4 text-xs leading-relaxed text-[#F7F3EA]/55">
              <div className="mb-2 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-[#D6A23A] bg-[#D6A23A]/25" />Platinum users</div>
              <div className="mb-3 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-[#5EA4FF] bg-[#2E5EAA]/30" />Official resources</div>
              Other territories remain visually muted and are not available for full participation during onboarding.
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .rfx-input { width: 100%; border: 1px solid rgb(247 243 234 / 0.1); border-radius: 1rem; background: rgb(11 11 13 / 0.5); padding-top: 0.875rem; padding-bottom: 0.875rem; padding-right: 1rem; color: #F7F3EA; box-shadow: inset 0 2px 4px rgb(0 0 0 / 0.2); transition: border-color 150ms, box-shadow 150ms; }
        .rfx-input::placeholder { color: rgb(247 243 234 / 0.3); }
        .rfx-input:focus { outline: none; border-color: rgb(214 162 58 / 0.5); box-shadow: 0 0 0 1px rgb(214 162 58 / 0.5); }
        .rfx-marker { position: relative; display: flex; cursor: pointer; flex-direction: column; align-items: center; animation: slideUp 0.45s ease-out both; }
        .rfx-marker__icon { display: flex; width: 2.5rem; height: 2.5rem; align-items: center; justify-content: center; border-width: 1px; border-radius: 1rem; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.4); backdrop-filter: blur(12px); transition: transform 150ms; }
        .rfx-marker:hover .rfx-marker__icon, .rfx-marker:focus .rfx-marker__icon { transform: scale(1.1); }
        .rfx-marker__tooltip { pointer-events: none; position: absolute; top: 3rem; white-space: nowrap; border: 1px solid rgb(247 243 234 / 0.1); border-radius: 9999px; background: rgb(11 11 13 / 0.94); padding: 0.375rem 0.75rem; color: #F7F3EA; font-size: 11px; opacity: 0; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.4); backdrop-filter: blur(8px); transition: opacity 150ms; }
        .rfx-marker:hover .rfx-marker__tooltip, .rfx-marker:focus .rfx-marker__tooltip { opacity: 1; }
        .rfx-marker__stem { width: 1px; height: 2rem; margin-top: 0.25rem; }
        .maplibregl-ctrl-attrib { background: rgb(11 11 13 / 0.78) !important; color: rgb(247 243 234 / 0.72) !important; }
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

function Action({ icon, label }) {
  return (
    <button type="button" className="flex flex-col items-center gap-2 rounded-xl border border-[#F7F3EA]/10 bg-[#F7F3EA]/[0.035] px-2 py-3 text-xs font-medium text-[#F7F3EA]/80 transition hover:border-[#D6A23A]/40 hover:bg-[#D6A23A]/[0.06]">
      <span className="text-[#D6A23A]">{icon}</span>{label}
    </button>
  );
}
