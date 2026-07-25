import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  ArrowRight,
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

const MOCK_LOCATIONS = [
  { id: 'loc_1', name: 'Newport News', state: 'VA', type: 'City', center: [-76.473, 37.0871], radius: 0.08 },
  { id: 'loc_2', name: 'Austin', state: 'TX', type: 'City', center: [-97.7431, 30.2672], radius: 0.1 },
  { id: 'loc_3', name: 'Cook County', state: 'IL', type: 'County', center: [-87.6976, 41.7377], radius: 0.2 },
  { id: 'loc_4', name: 'Manhattan', state: 'NY', type: 'Locality', center: [-73.9712, 40.7831], radius: 0.05 },
  { id: 'loc_5', name: '90210 (Beverly Hills)', state: 'CA', type: 'ZIP Code', center: [-118.4105, 34.103], radius: 0.03 },
];

const EMPTY_FEATURE_COLLECTION = {
  type: 'FeatureCollection',
  features: [],
};

const generateMockMarkers = ([longitude, latitude]) => [
  {
    id: 'm1',
    type: 'platinum',
    label: 'Acme Corp (Platinum)',
    coords: [longitude - 0.02, latitude + 0.01],
  },
  {
    id: 'm2',
    type: 'resource',
    label: 'Economic Development Office',
    coords: [longitude + 0.01, latitude - 0.015],
  },
  {
    id: 'm3',
    type: 'platinum',
    label: 'TechFlow Solutions',
    coords: [longitude + 0.03, latitude + 0.02],
  },
];

function createSquareRing([longitude, latitude], radius) {
  const west = longitude - radius;
  const east = longitude + radius;
  const south = latitude - radius;
  const north = latitude + radius;

  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

function createMutedOverlayFeature(center, radius) {
  const selectedArea = createSquareRing(center, radius);

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-180, -85],
          [180, -85],
          [180, 85],
          [-180, 85],
          [-180, -85],
        ],
        [...selectedArea].reverse(),
      ],
    },
  };
}

function createSelectedAreaFeature(center, radius) {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [createSquareRing(center, radius)],
    },
  };
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

function ensureMapLayers(map) {
  if (!map.getSource('muted-overlay')) {
    map.addSource('muted-overlay', {
      type: 'geojson',
      data: EMPTY_FEATURE_COLLECTION,
    });
  }

  if (!map.getLayer('muted-overlay-fill')) {
    map.addLayer({
      id: 'muted-overlay-fill',
      type: 'fill',
      source: 'muted-overlay',
      paint: {
        'fill-color': '#0B0B0D',
        'fill-opacity': 0.74,
      },
    });
  }

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
        'fill-opacity': 0.08,
      },
    });
  }

  if (!map.getLayer('selected-geography-outline')) {
    map.addLayer({
      id: 'selected-geography-outline',
      type: 'line',
      source: 'selected-geography',
      paint: {
        'line-color': '#D6A23A',
        'line-width': 2,
        'line-opacity': 0.9,
      },
    });
  }
}

function createMarkerElement(type, label) {
  const isPlatinum = type === 'platinum';
  const accent = isPlatinum ? '#D6A23A' : '#2E5EAA';
  const background = isPlatinum ? 'rgba(214,162,58,0.15)' : 'rgba(46,94,170,0.15)';

  const root = document.createElement('div');
  root.className = 'rfx-marker group';
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
  const [mapError, setMapError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedGeography, setSelectedGeography] = useState(null);
  const [isMapZoomed, setIsMapZoomed] = useState(false);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const timersRef = useRef(new Set());

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
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
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
      },
      center: [-98.5795, 39.8283],
      zoom: 2.5,
      pitch: 0,
      bearing: 0,
      interactive: true,
      attributionControl: true,
    });

    mapRef.current = map;
    disableMapInteractions(map);

    const handleLoad = () => {
      if (mapRef.current !== map) return;

      try {
        ensureMapLayers(map);
        setMapLoaded(true);
        setMapError('');
      } catch (error) {
        console.error('Map layer initialization failed:', error);
        setMapError('The map loaded, but its onboarding layers could not be initialized.');
      }
    };

    const handleError = (event) => {
      console.error('MapLibre error:', event?.error ?? event);
      setMapError('The map could not load completely. Check the tile request and Content Security Policy.');
    };

    map.on('load', handleLoad);
    map.on('error', handleError);

    return () => {
      clearTimers();
      removeMarkers();
      map.off('load', handleLoad);
      map.off('error', handleError);
      map.remove();

      if (mapRef.current === map) {
        mapRef.current = null;
      }
    };
  }, [clearTimers, removeMarkers]);

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData((previous) => ({
      ...previous,
      [name]: type === 'checkbox' ? checked : value,
    }));
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

  const handleGeographySearch = (event) => {
    const query = event.target.value;
    const normalizedQuery = query.trim().toLowerCase();

    setSearchQuery(query);
    setSearchResults(
      normalizedQuery.length < 2
        ? []
        : MOCK_LOCATIONS.filter((location) =>
            [location.name, location.state, location.type].some((value) =>
              value.toLowerCase().includes(normalizedQuery),
            ),
          ),
    );
  };

  const addMarkers = useCallback(
    (map, center) => {
      removeMarkers();

      generateMockMarkers(center).forEach((markerData, index) => {
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

  const selectGeography = (location) => {
    const map = mapRef.current;

    if (!map || !mapLoaded || !map.loaded()) {
      setMapError('The map is still loading. Please select the location again when it is ready.');
      return;
    }

    clearTimers();
    removeMarkers();
    setSelectedGeography(location);
    setSearchQuery('');
    setSearchResults([]);
    setIsMapZoomed(true);
    setMapError('');

    try {
      ensureMapLayers(map);

      map.getSource('muted-overlay')?.setData(
        createMutedOverlayFeature(location.center, location.radius),
      );
      map.getSource('selected-geography')?.setData(
        createSelectedAreaFeature(location.center, location.radius),
      );

      map.flyTo({
        center: location.center,
        zoom: 12.5,
        pitch: 60,
        bearing: -15,
        duration: 1800,
        essential: true,
      });

      map.once('moveend', () => {
        if (mapRef.current !== map) return;
        addMarkers(map, location.center);
        enableMapInteractions(map);
      });
    } catch (error) {
      console.error('Geography selection failed:', error);
      setIsMapZoomed(false);
      setMapError('The selected geography could not be displayed.');
    }
  };

  const handleConfirmGeography = () => {
    if (!selectedGeography) return;
    setStep(4);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0B0B0D] p-4 font-sans text-[#F7F3EA] antialiased">
      <div ref={mapContainerRef} className="absolute inset-0 z-0" aria-label="Business geography map" />

      <div
        className={`pointer-events-none absolute inset-0 z-0 transition-opacity duration-1000 ${
          step === 3 && isMapZoomed
            ? 'opacity-20'
            : 'bg-[radial-gradient(circle_at_center,transparent_0%,#0B0B0D_100%)] opacity-60'
        }`}
      />

      {mapError && (
        <div
          className="absolute left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 rounded-xl border border-red-400/30 bg-red-950/90 px-4 py-3 text-sm text-red-100 shadow-xl"
          role="alert"
        >
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
              <h1 className="text-2xl font-semibold tracking-wide">
                The <span className="font-light">RF</span>xchange
              </h1>
            </div>
            <h2 className="mb-2 text-3xl font-medium tracking-tight">Activate your network.</h2>
            <p className="mx-auto max-w-sm text-sm text-[#F7F3EA]/60">
              Create your business account, then place the organization in its primary geography.
            </p>
          </div>

          <form onSubmit={handleRegisterSubmit} className="space-y-5 px-6 py-8 sm:px-10">
            <Field label="Business Name" icon={<Building2 size={18} />}>
              <input
                type="text"
                name="businessName"
                required
                autoComplete="organization"
                value={formData.businessName}
                onChange={handleInputChange}
                className="rfx-input pl-11"
                placeholder="Acme Industries LLC"
              />
            </Field>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="First Name" icon={<User size={18} />}>
                <input
                  type="text"
                  name="firstName"
                  required
                  autoComplete="given-name"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  className="rfx-input pl-11"
                  placeholder="Jane"
                />
              </Field>

              <Field label="Last Name">
                <input
                  type="text"
                  name="lastName"
                  required
                  autoComplete="family-name"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  className="rfx-input px-4"
                  placeholder="Doe"
                />
              </Field>
            </div>

            <Field label="Work Email" icon={<Mail size={18} />}>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                value={formData.email}
                onChange={handleInputChange}
                className="rfx-input pl-11"
                placeholder="jane@acme.com"
              />
            </Field>

            <Field label="Password" icon={<Lock size={18} />}>
              <input
                type="password"
                name="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={formData.password}
                onChange={handleInputChange}
                className="rfx-input pl-11"
                placeholder="At least 8 characters"
              />
            </Field>

            <label className="group flex cursor-pointer items-start gap-3 pb-4 pt-2">
              <span className="relative mt-0.5 flex items-center justify-center">
                <input
                  type="checkbox"
                  name="termsAccepted"
                  required
                  checked={formData.termsAccepted}
                  onChange={handleInputChange}
                  className="peer sr-only"
                />
                <span className="flex h-5 w-5 items-center justify-center rounded-md border-2 border-[#F7F3EA]/30 bg-[#0B0B0D]/50 transition-colors group-hover:border-[#D6A23A]/70 peer-checked:border-[#D6A23A] peer-checked:bg-[#D6A23A]">
                  {formData.termsAccepted && <ShieldCheck size={14} className="text-[#0B0B0D]" />}
                </span>
              </span>
              <span className="text-sm leading-relaxed text-[#F7F3EA]/70">
                I acknowledge the Terms of Service and Privacy Policy.
              </span>
            </label>

            <button
              type="submit"
              disabled={!formData.termsAccepted || isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#D6A23A] to-[#b88a31] py-4 font-semibold text-[#0B0B0D] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(214,162,58,0.3)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle size={18} className="animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight size={18} className="stroke-[2.5px]" />
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {step === 2 && (
        <div className="relative z-10 w-full max-w-lg rounded-[32px] border border-[#D6A23A]/30 bg-[#252932]/70 p-8 text-center shadow-[0_0_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl animate-[fadeIn_0.5s_ease-out] sm:p-10">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-[#D6A23A]/50 bg-[#D6A23A]/10 shadow-inner">
            <MapPin size={32} className="text-[#D6A23A]" />
          </div>
          <h2 className="mb-4 text-3xl font-semibold tracking-tight">Welcome to The RFxchange.</h2>
          <p className="mb-10 text-lg leading-relaxed text-[#F7F3EA]/80">
            Place your business on the Exchange so customers, partners, resources, and opportunities can find it.
          </p>
          <button
            type="button"
            onClick={() => setStep(3)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D6A23A] py-4 font-semibold text-[#0B0B0D] shadow-lg shadow-[#D6A23A]/20 transition-all hover:-translate-y-0.5 hover:bg-[#e4b553]"
          >
            Add My Business
            <Navigation size={18} />
          </button>
        </div>
      )}

      {step === 3 && (
        <div
          className={`absolute left-1/2 top-8 z-20 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 transition-all duration-700 ${
            isMapZoomed ? 'pointer-events-none -translate-y-5 opacity-0' : 'opacity-100'
          }`}
        >
          <div className="rounded-[32px] border border-[#F7F3EA]/20 bg-[#252932]/85 p-6 shadow-2xl backdrop-blur-2xl animate-[slideDown_0.5s_ease-out] sm:p-8">
            <h2 className="mb-2 text-center text-2xl font-semibold">Where does your business operate?</h2>
            <p className="mb-6 text-center text-sm text-[#F7F3EA]/60">
              Search by city, county, ZIP code, or locality to establish the primary network.
            </p>

            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-5">
                {mapLoaded ? (
                  <Search size={20} className="text-[#D6A23A]" />
                ) : (
                  <LoaderCircle size={20} className="animate-spin text-[#D6A23A]" />
                )}
              </div>
              <input
                type="search"
                value={searchQuery}
                onChange={handleGeographySearch}
                disabled={!mapLoaded}
                className="w-full rounded-2xl border-2 border-[#D6A23A]/30 bg-[#0B0B0D]/80 py-4 pl-14 pr-6 text-lg text-[#F7F3EA] shadow-inner transition-all placeholder:text-[#F7F3EA]/40 focus:border-[#D6A23A] focus:outline-none focus:ring-4 focus:ring-[#D6A23A]/20 disabled:cursor-wait disabled:opacity-60"
                placeholder={mapLoaded ? 'e.g. Newport News, 90210, Cook County...' : 'Loading map...'}
                autoFocus
              />

              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-30 mt-3 max-h-64 overflow-y-auto rounded-2xl border border-[#F7F3EA]/10 bg-[#252932]/95 shadow-2xl backdrop-blur-xl">
                  {searchResults.map((location) => (
                    <button
                      type="button"
                      key={location.id}
                      onClick={() => selectGeography(location)}
                      className="group flex w-full items-center gap-4 border-b border-[#F7F3EA]/5 px-6 py-4 text-left transition-colors hover:bg-[#D6A23A]/10"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0B0B0D]/50 text-[#F7F3EA]/40 transition-colors group-hover:text-[#D6A23A]">
                        <MapPin size={18} />
                      </span>
                      <span>
                        <span className="block text-lg font-semibold">
                          {location.name}, {location.state}
                        </span>
                        <span className="block text-sm text-[#F7F3EA]/50">{location.type}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 3 && isMapZoomed && selectedGeography && (
        <div className="absolute bottom-6 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-col items-stretch gap-5 rounded-[32px] border border-[#D6A23A]/50 bg-[#252932]/90 px-6 py-5 shadow-[0_20px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl animate-[slideUp_0.5s_ease-out_1.6s_both] sm:bottom-10 sm:w-auto sm:max-w-none sm:flex-row sm:items-center sm:gap-6 sm:px-8">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F7F3EA]/60">
              <Crosshair size={12} className="text-[#D6A23A]" />
              Selected Geography
            </div>
            <div className="text-2xl font-bold text-[#F7F3EA]">
              {selectedGeography.name}, {selectedGeography.state}
            </div>
          </div>
          <div className="hidden h-10 w-px bg-[#F7F3EA]/20 sm:block" />
          <button
            type="button"
            onClick={handleConfirmGeography}
            className="whitespace-nowrap rounded-xl bg-[#D6A23A] px-6 py-3 font-bold text-[#0B0B0D] transition-all hover:-translate-y-0.5 hover:bg-[#e4b553] hover:shadow-[0_0_20px_rgba(214,162,58,0.4)]"
          >
            Confirm & Continue
          </button>
        </div>
      )}

      {step === 4 && selectedGeography && (
        <div className="relative z-20 w-full max-w-lg rounded-[32px] border border-[#D6A23A]/40 bg-[#252932]/85 p-10 text-center shadow-[0_0_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl animate-[fadeIn_0.5s_ease-out]">
          <CheckCircle2 size={54} className="mx-auto mb-5 text-[#D6A23A]" />
          <h2 className="mb-3 text-3xl font-semibold">Business geography saved.</h2>
          <p className="text-[#F7F3EA]/70">
            {formData.businessName || 'Your business'} is now centered in {selectedGeography.name}, {selectedGeography.state}.
          </p>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .rfx-input {
          width: 100%;
          border: 1px solid rgb(247 243 234 / 0.1);
          border-radius: 1rem;
          background: rgb(11 11 13 / 0.5);
          padding-top: 0.875rem;
          padding-bottom: 0.875rem;
          padding-right: 1rem;
          color: #F7F3EA;
          box-shadow: inset 0 2px 4px rgb(0 0 0 / 0.2);
          transition: border-color 150ms, box-shadow 150ms;
        }

        .rfx-input::placeholder { color: rgb(247 243 234 / 0.3); }
        .rfx-input:focus {
          outline: none;
          border-color: rgb(214 162 58 / 0.5);
          box-shadow: 0 0 0 1px rgb(214 162 58 / 0.5);
        }

        .rfx-marker {
          position: relative;
          display: flex;
          cursor: pointer;
          flex-direction: column;
          align-items: center;
          animation: slideUp 0.5s ease-out both;
        }

        .rfx-marker__icon {
          display: flex;
          width: 2.5rem;
          height: 2.5rem;
          align-items: center;
          justify-content: center;
          border-width: 1px;
          border-radius: 1rem;
          box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.35);
          backdrop-filter: blur(12px);
          transition: transform 150ms;
        }

        .rfx-marker:hover .rfx-marker__icon,
        .rfx-marker:focus .rfx-marker__icon { transform: scale(1.1); }

        .rfx-marker__tooltip {
          pointer-events: none;
          position: absolute;
          top: 3rem;
          white-space: nowrap;
          border: 1px solid rgb(247 243 234 / 0.1);
          border-radius: 9999px;
          background: rgb(11 11 13 / 0.9);
          padding: 0.375rem 0.75rem;
          color: #F7F3EA;
          font-size: 11px;
          opacity: 0;
          box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.35);
          backdrop-filter: blur(8px);
          transition: opacity 150ms;
        }

        .rfx-marker:hover .rfx-marker__tooltip,
        .rfx-marker:focus .rfx-marker__tooltip { opacity: 1; }

        .rfx-marker__stem {
          width: 1px;
          height: 2rem;
          margin-top: 0.25rem;
        }

        .maplibregl-ctrl-attrib {
          background: rgb(11 11 13 / 0.72) !important;
          color: rgb(247 243 234 / 0.72) !important;
        }

        .maplibregl-ctrl-attrib a { color: #D6A23A !important; }
      `}</style>
    </div>
  );
}

function Field({ label, icon, children }) {
  return (
    <div className="space-y-1.5">
      <label className="ml-1 text-xs font-medium uppercase tracking-wider text-[#F7F3EA]/70">
        {label}
      </label>
      <div className="group relative">
        {icon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[#F7F3EA]/40 transition-colors group-focus-within:text-[#D6A23A]">
            {icon}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
