import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  ArrowRight,
  Box,
  Building2,
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
import {
  canonicalOnboardingGeography,
  createOutsideMaskFeature,
  createPrototypeEntitlement,
  entitlementAllows,
  validateFeatureIdentity,
} from './environment.js';

const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] };
const DEFAULT_VIEW = { center: [-98.5795, 39.8283], zoom: 3.1, pitch: 45, bearing: -10 };

// Keep map startup self-contained. The basemap is live CARTO/OSM imagery; 3D buildings
// come from live OpenFreeMap/OpenMapTiles data. No remote style document is required
// before MapLibre can render its first frame.
const BASE_STYLE = {
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
  layers: [
    {
      id: 'carto-dark-layer',
      type: 'raster',
      source: 'carto-dark',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

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

function ensureGeographyLayers(map) {
  if (!map.getSource('outside-selected-geography')) {
    map.addSource('outside-selected-geography', { type: 'geojson', data: EMPTY_FEATURE_COLLECTION });
  }
  if (!map.getLayer('outside-selected-geography-fill')) {
    map.addLayer({
      id: 'outside-selected-geography-fill',
      type: 'fill',
      source: 'outside-selected-geography',
      paint: { 'fill-color': '#08090B', 'fill-opacity': 0.72 },
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
      paint: { 'fill-color': '#D6A23A', 'fill-opacity': 0.1 },
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
  map.addLayer({
    id: 'rfx-3d-buildings',
    source: 'openfreemap-3d',
    'source-layer': 'building',
    type: 'fill-extrusion',
    minzoom: 13,
    paint: {
      'fill-extrusion-color': '#4B515B',
      'fill-extrusion-height': [
        'interpolate', ['linear'], ['zoom'], 13, 0, 15,
        ['coalesce', ['to-number', ['get', 'render_height'], 0], ['to-number', ['get', 'height'], 12], 12],
      ],
      'fill-extrusion-base': [
        'coalesce', ['to-number', ['get', 'render_min_height'], 0], ['to-number', ['get', 'min_height'], 0], 0,
      ],
      'fill-extrusion-opacity': 0.94,
      'fill-extrusion-vertical-gradient': true,
    },
  });
}

function cameraForGeography(map, bounds, center, is3D = true) {
  const camera = map.cameraForBounds(bounds, {
    padding: { top: 110, right: 70, bottom: 150, left: 70 },
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
    businessName: '', firstName: '', lastName: '', email: '', password: '', termsAccepted: false,
  });
  const [onboardingState, setOnboardingState] = useState({ account: null, selectedGeography: null, geographyStatus: 'unselected' });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [boundaryLoadingId, setBoundaryLoadingId] = useState(null);
  const [previewGeography, setPreviewGeography] = useState(null);
  const [is3D, setIs3D] = useState(true);
  const [isEntering, setIsEntering] = useState(false);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const boundaryAbortRef = useRef(null);
  const entitlementRef = useRef(null);
  const pendingMapViewRef = useRef(null);

  const renderGeography = useCallback((map, geography, feature, animate = true) => {
    if (!map || !map.loaded()) {
      pendingMapViewRef.current = { geography, feature, animate };
      return;
    }
    pendingMapViewRef.current = null;
    ensureGeographyLayers(map);
    const mask = createOutsideMaskFeature(feature.geometry);
    map.getSource('selected-geography')?.setData({ type: 'FeatureCollection', features: [feature] });
    map.getSource('outside-selected-geography')?.setData(mask ? { type: 'FeatureCollection', features: [mask] } : EMPTY_FEATURE_COLLECTION);
    map.easeTo({ ...cameraForGeography(map, geography.bounds, geography.center, true), duration: animate ? 1600 : 0, essential: true });
    map.once('moveend', () => {
      if (mapRef.current === map) enableMapInteractions(map);
    });
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return undefined;

    let map;
    try {
      map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: BASE_STYLE,
        ...DEFAULT_VIEW,
        maxPitch: 75,
        interactive: true,
        antialias: true,
        attributionControl: true,
      });
    } catch (error) {
      console.error('Map startup failed:', error);
      return undefined;
    }

    mapRef.current = map;
    disableMapInteractions(map);

    const handleLoad = () => {
      if (mapRef.current !== map) return;
      ensureGeographyLayers(map);

      // 3D enhancement is deliberately isolated: a vector-source failure must not
      // prevent the basemap from rendering.
      try {
        ensure3DBuildings(map);
      } catch (error) {
        console.warn('3D buildings unavailable:', error);
      }

      const pending = pendingMapViewRef.current;
      if (pending) renderGeography(map, pending.geography, pending.feature, pending.animate);
    };

    const handleError = (event) => console.warn('Map resource warning:', event?.error ?? event);
    map.on('load', handleLoad);
    map.on('error', handleError);
    map.resize();

    return () => {
      boundaryAbortRef.current?.abort();
      map.off('load', handleLoad);
      map.off('error', handleError);
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [renderGeography]);

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
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError('');
      try {
        setSearchResults(await searchTigerGeographies(query, { signal: controller.signal }));
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.error('Location search failed:', error);
          setSearchError('Search is unavailable right now. Try again.');
          setSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 320);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [previewGeography, searchQuery, step]);

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData((previous) => ({ ...previous, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleRegisterSubmit = (event) => {
    event.preventDefault();
    if (!formData.termsAccepted) return;
    setOnboardingState((previous) => ({
      ...previous,
      account: { businessName: formData.businessName, firstName: formData.firstName, lastName: formData.lastName, email: formData.email },
    }));
    setStep(2);
  };

  const selectGeography = async (location) => {
    boundaryAbortRef.current?.abort();
    const controller = new AbortController();
    boundaryAbortRef.current = controller;
    setBoundaryLoadingId(location.id);
    setLocationError('');
    try {
      const feature = await fetchTigerBoundary(location, { signal: controller.signal });
      validateFeatureIdentity(location, feature);
      const bounds = geometryBounds(feature.geometry);
      const center = boundsCenter(bounds) ?? location.center;
      if (!bounds || !center) throw new Error('No usable map extent returned.');
      const canonical = canonicalOnboardingGeography(location, feature, center, bounds);
      entitlementRef.current = createPrototypeEntitlement(canonical, feature);
      setOnboardingState((previous) => ({ ...previous, selectedGeography: canonical, geographyStatus: 'validated' }));
      setPreviewGeography(canonical);
      setSearchQuery('');
      setSearchResults([]);
      setIs3D(true);
      renderGeography(mapRef.current, canonical, feature, true);
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('Location selection failed:', error);
        entitlementRef.current = null;
        setOnboardingState((previous) => ({ ...previous, selectedGeography: null, geographyStatus: 'invalid' }));
        setLocationError('We could not use that location. Try another.');
      }
    } finally {
      if (!controller.signal.aborted) setBoundaryLoadingId(null);
    }
  };

  const handleChangeGeography = () => {
    entitlementRef.current = null;
    pendingMapViewRef.current = null;
    setPreviewGeography(null);
    setLocationError('');
    setOnboardingState((previous) => ({ ...previous, selectedGeography: null, geographyStatus: 'unselected' }));
    const map = mapRef.current;
    if (map?.loaded()) {
      map.getSource('selected-geography')?.setData(EMPTY_FEATURE_COLLECTION);
      map.getSource('outside-selected-geography')?.setData(EMPTY_FEATURE_COLLECTION);
      disableMapInteractions(map);
      map.easeTo({ ...DEFAULT_VIEW, duration: 700 });
    }
    setStep(3);
  };

  const handleEnterMap = async () => {
    const entitlement = entitlementRef.current;
    const selected = onboardingState.selectedGeography;
    if (!entitlement || !selected || !entitlementAllows(entitlement, selected)) {
      setLocationError('Please choose your location again.');
      setStep(3);
      return;
    }
    setIsEntering(true);
    setLocationError('');
    try {
      const feature = await fetchTigerBoundary(entitlement.geography);
      validateFeatureIdentity(entitlement.geography, feature);
      if (!entitlementAllows(entitlement, onboardingState.selectedGeography)) throw new Error('Selected location changed.');
      setOnboardingState((previous) => ({ ...previous, geographyStatus: 'authorized' }));
      setStep(4);
      renderGeography(mapRef.current, entitlement.geography, feature, false);
      if (mapRef.current?.loaded()) enableMapInteractions(mapRef.current);
    } catch (error) {
      console.error('Location setup failed:', error);
      setLocationError('We could not finish setting up this location. Try again.');
      setOnboardingState((previous) => ({ ...previous, geographyStatus: 'invalid' }));
      entitlementRef.current = null;
      setStep(3);
    } finally {
      setIsEntering(false);
    }
  };

  const toggle3D = () => {
    const map = mapRef.current;
    setIs3D((previous) => {
      const next = !previous;
      if (map?.loaded()) map.easeTo({ pitch: next ? 62 : 0, bearing: next ? -18 : 0, duration: 650, essential: true });
      return next;
    });
  };

  const geographyName = previewGeography ? geographyLabel(previewGeography) : '';

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0B0B0D] font-sans text-[#F7F3EA] antialiased">
      <div ref={mapContainerRef} className="absolute inset-0" aria-label="Interactive 3D RFxchange map" />
      <div className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${step >= 3 && previewGeography ? 'opacity-0' : 'bg-[radial-gradient(circle_at_center,transparent_0%,#0B0B0D_100%)] opacity-55'}`} />

      <main className="relative z-10 flex min-h-screen items-center justify-center p-4">
        {step === 1 && (
          <div className="w-full max-w-xl overflow-hidden rounded-[32px] border border-[#F7F3EA]/10 bg-[#252932]/80 shadow-2xl backdrop-blur-2xl">
            <div className="border-b border-[#F7F3EA]/5 px-6 pb-6 pt-10 text-center sm:px-10">
              <div className="mb-6 flex items-center justify-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#D6A23A] text-xl font-bold text-[#0B0B0D]">RF</div>
                <h1 className="text-2xl font-semibold tracking-wide">The <span className="font-light">RF</span>xchange</h1>
              </div>
              <h2 className="mb-2 text-3xl font-medium">Activate your network.</h2>
              <p className="text-sm text-[#F7F3EA]/60">Create your business account and connect with your local business community.</p>
            </div>
            <form onSubmit={handleRegisterSubmit} className="space-y-5 px-6 py-8 sm:px-10">
              <Field label="Business Name" icon={<Building2 size={18} />}><input className="rfx-input pl-11" name="businessName" required value={formData.businessName} onChange={handleInputChange} placeholder="Acme Industries LLC" /></Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="First Name" icon={<User size={18} />}><input className="rfx-input pl-11" name="firstName" required value={formData.firstName} onChange={handleInputChange} placeholder="Jane" /></Field>
                <Field label="Last Name"><input className="rfx-input px-4" name="lastName" required value={formData.lastName} onChange={handleInputChange} placeholder="Doe" /></Field>
              </div>
              <Field label="Work Email" icon={<Mail size={18} />}><input type="email" className="rfx-input pl-11" name="email" required value={formData.email} onChange={handleInputChange} placeholder="jane@acme.com" /></Field>
              <Field label="Password" icon={<Lock size={18} />}><input type="password" className="rfx-input pl-11" name="password" required minLength={8} value={formData.password} onChange={handleInputChange} placeholder="At least 8 characters" /></Field>
              <label className="flex items-start gap-3 text-sm text-[#F7F3EA]/70"><input type="checkbox" name="termsAccepted" required checked={formData.termsAccepted} onChange={handleInputChange} className="mt-1" />I acknowledge the Terms of Service and Privacy Policy.</label>
              <button type="submit" disabled={!formData.termsAccepted} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D6A23A] py-4 font-semibold text-[#0B0B0D] disabled:opacity-50">Continue<ArrowRight size={18} /></button>
            </form>
          </div>
        )}

        {step === 2 && (
          <div className="w-full max-w-lg rounded-[32px] border border-[#D6A23A]/30 bg-[#252932]/82 p-8 text-center shadow-2xl backdrop-blur-2xl">
            <MapPin size={38} className="mx-auto mb-5 text-[#D6A23A]" />
            <h2 className="mb-4 text-3xl font-semibold">Welcome to The RFxchange.</h2>
            <p className="mb-8 text-lg text-[#F7F3EA]/80">Choose the area where your business is based to begin exploring your local network.</p>
            <button type="button" onClick={() => setStep(3)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D6A23A] py-4 font-semibold text-[#0B0B0D]">Choose My Area<Navigation size={18} /></button>
          </div>
        )}

        {step === 3 && !previewGeography && (
          <div className="absolute left-1/2 top-8 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 rounded-[32px] border border-[#F7F3EA]/20 bg-[#252932]/90 p-6 shadow-2xl backdrop-blur-2xl sm:p-8">
            <h2 className="mb-2 text-center text-2xl font-semibold">Where is your business based?</h2>
            <p className="mb-6 text-center text-sm text-[#F7F3EA]/60">Search by city, county, ZIP code, or metro area.</p>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-5">{isSearching ? <LoaderCircle size={20} className="animate-spin text-[#D6A23A]" /> : <Search size={20} className="text-[#D6A23A]" />}</div>
              <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="w-full rounded-2xl border-2 border-[#D6A23A]/30 bg-[#0B0B0D]/80 py-4 pl-14 pr-6 text-lg outline-none focus:border-[#D6A23A]" placeholder="e.g. Portsmouth VA, Cook County IL, 90210..." autoFocus />
              {(searchResults.length > 0 || searchError || locationError || (searchQuery.trim().length >= 2 && !isSearching)) && (
                <div className="absolute left-0 right-0 top-full z-30 mt-3 max-h-[22rem] overflow-y-auto rounded-2xl border border-[#F7F3EA]/10 bg-[#252932]/97 shadow-2xl">
                  {searchResults.map((location) => (
                    <button type="button" key={location.id} onClick={() => selectGeography(location)} disabled={Boolean(boundaryLoadingId)} className="flex w-full items-center gap-4 border-b border-[#F7F3EA]/5 px-5 py-3.5 text-left hover:bg-[#D6A23A]/10 disabled:opacity-60">
                      {boundaryLoadingId === location.id ? <LoaderCircle size={18} className="animate-spin text-[#D6A23A]" /> : <MapPin size={18} />}
                      <span><span className="block font-semibold">{geographyLabel(location)}</span><span className="block text-sm text-[#F7F3EA]/50">{location.type}</span></span>
                    </button>
                  ))}
                  {!isSearching && searchResults.length === 0 && !searchError && !locationError && <div className="px-5 py-4 text-sm text-[#F7F3EA]/60">No matches found. Try another place name, county, state, or ZIP code.</div>}
                  {searchError && <div className="px-5 py-4 text-sm text-red-200">{searchError}</div>}
                  {locationError && <div className="px-5 py-4 text-sm text-red-200">{locationError}</div>}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 3 && previewGeography && (
          <>
            <MapControls is3D={is3D} toggle3D={toggle3D} />
            <div className="absolute bottom-6 left-1/2 flex w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 flex-col gap-5 rounded-[28px] border border-[#D6A23A]/50 bg-[#252932]/92 px-6 py-5 shadow-2xl backdrop-blur-2xl md:flex-row md:items-center">
              <div className="min-w-0 flex-1"><div className="text-xs uppercase tracking-wider text-[#F7F3EA]/60">Your area</div><div className="truncate text-2xl font-bold">{geographyName}</div></div>
              <div className="flex gap-2"><button type="button" onClick={handleChangeGeography} className="rounded-xl border border-[#F7F3EA]/20 px-5 py-3 font-semibold">Change</button><button type="button" onClick={handleEnterMap} disabled={isEntering} className="flex items-center gap-2 rounded-xl bg-[#D6A23A] px-6 py-3 font-bold text-[#0B0B0D] disabled:opacity-60">{isEntering ? <LoaderCircle size={17} className="animate-spin" /> : <ArrowRight size={17} />}Continue</button></div>
            </div>
          </>
        )}

        {step === 4 && previewGeography && (
          <>
            <div className="absolute left-4 top-4 rounded-2xl border border-[#D6A23A]/35 bg-[#17191E]/90 px-4 py-3 backdrop-blur-xl"><div className="font-semibold">{geographyName}</div><div className="text-xs text-[#F7F3EA]/55">The RFxchange</div></div>
            <MapControls is3D={is3D} toggle3D={toggle3D} />
          </>
        )}
      </main>

      <style>{`.rfx-input{width:100%;border:1px solid rgb(247 243 234/.1);border-radius:1rem;background:rgb(11 11 13/.5);padding-top:.875rem;padding-bottom:.875rem;padding-right:1rem;color:#F7F3EA;outline:none}.rfx-input:focus{border-color:rgb(214 162 58/.65);box-shadow:0 0 0 2px rgb(214 162 58/.15)}.maplibregl-ctrl-attrib{background:rgb(11 11 13/.78)!important;color:rgb(247 243 234/.72)!important}.maplibregl-ctrl-attrib a{color:#D6A23A!important}`}</style>
    </div>
  );
}

function Field({ label, icon, children }) {
  return <div className="space-y-1.5"><label className="ml-1 text-xs font-medium uppercase tracking-wider text-[#F7F3EA]/70">{label}</label><div className="relative">{icon && <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[#F7F3EA]/40">{icon}</div>}{children}</div></div>;
}

function MapControls({ is3D, toggle3D }) {
  return <button type="button" onClick={toggle3D} className="absolute right-4 top-4 flex items-center gap-2 rounded-xl border border-[#F7F3EA]/15 bg-[#17191E]/90 px-4 py-3 text-sm font-semibold backdrop-blur-xl" aria-pressed={is3D}><Box size={17} className={is3D ? 'text-[#D6A23A]' : 'text-[#F7F3EA]/50'} />{is3D ? '3D' : '2D'}</button>;
}
