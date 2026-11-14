import { useEffect, useRef, useState } from 'preact/hooks';
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';
import type { VenueRow } from '../../db/queries';
import { formatEuroCentsNl } from '../../domain/seo-aggregator';
import { parseVenuePhotos } from '../../domain/venue-photos';
import {
  filterValidMapVenues,
  formatMapMarkerLabel,
  getMapMarkerButtonClasses,
  NL_DEFAULT_CENTER,
  NL_DEFAULT_ZOOM,
  NL_MAP_MAX_BOUNDS,
} from '../../domain/map-bounds';

type MapLibreModule = typeof import('maplibre-gl');

export interface ListingMapIslandProps {
  venues: VenueRow[];
  styleUrl?: string;
}

interface ActiveMarkerRecord {
  id: string;
  marker: MapLibreMarker;
  wrapperEl: HTMLDivElement;
  buttonEl: HTMLButtonElement;
}

function fitMapToVenues(maplibregl: MapLibreModule, map: MapLibreMap, list: VenueRow[]) {
  if (list.length === 0) return;
  try {
    if (list.length === 1) {
      map.flyTo({ center: [list[0].lng, list[0].lat], zoom: 13, duration: 500 });
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    for (const v of list) {
      bounds.extend([v.lng, v.lat]);
    }
    map.fitBounds(bounds, { padding: 54, maxZoom: 13.2, duration: 550 });
  } catch {
    // Ignore bounds error in headless mode
  }
}

export default function ListingMapIsland({
  venues,
  styleUrl = 'https://tiles.openfreemap.org/styles/liberty',
}: ListingMapIslandProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<ActiveMarkerRecord[]>([]);

  // Only show the loaded/displayed venues on the homepage (initially 24)
  const initialLoaded = filterValidMapVenues(venues).slice(0, 24);
  const [loadedVenues, setLoadedVenues] = useState<VenueRow[]>(initialLoaded);
  const [selectedVenue, setSelectedVenue] = useState<VenueRow | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [hoveredVenueId, setHoveredVenueId] = useState<string | null>(null);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [regionLabel, setRegionLabel] = useState('Heel Nederland (24 geladen)');
  const mapCardTrackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelectedPhotoIndex(0);
    if (mapCardTrackRef.current) {
      mapCardTrackRef.current.scrollLeft = 0;
    }
  }, [selectedVenue?.id]);

  // Listen for filter & hover events from SearchAndFilterIsland
  useEffect(() => {
    function onFiltered(e: Event) {
      const detail = (
        e as CustomEvent<{
          venues: VenueRow[];
          totalFiltered?: number;
          query: string;
          cityLabel?: string;
        }>
      ).detail;
      if (!detail) return;
      const validLoaded = filterValidMapVenues(detail.venues);
      setLoadedVenues(validLoaded);

      if (detail.cityLabel && detail.cityLabel !== 'ALL') {
        setRegionLabel(`${detail.cityLabel} (${validLoaded.length} op kaart)`);
      } else if (detail.query && detail.query.trim() !== '') {
        setRegionLabel(`Zoekgebied: "${detail.query.trim()}" (${validLoaded.length} op kaart)`);
      } else {
        setRegionLabel(`Heel Nederland (${validLoaded.length} geladen op kaart)`);
      }

      setSelectedVenue((prev) =>
        prev && validLoaded.some((v) => v.id === prev.id) ? prev : null
      );
    }

    function onHover(e: Event) {
      const detail = (e as CustomEvent<{ venueId: string | null }>).detail;
      setHoveredVenueId(detail?.venueId ?? null);
    }

    window.addEventListener('zwemkaart:filtered', onFiltered);
    window.addEventListener('zwemkaart:hover-venue', onHover);
    return () => {
      window.removeEventListener('zwemkaart:filtered', onFiltered);
      window.removeEventListener('zwemkaart:hover-venue', onHover);
    };
  }, []);

  // Initialize MapLibre with colorful aquatic overrides & strict Netherlands bounds
  useEffect(() => {
    let mapInstance: MapLibreMap | null = null;

    async function initMap() {
      if (!mapContainerRef.current) return;
      const maplibregl = await import('maplibre-gl');
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: styleUrl,
        center: NL_DEFAULT_CENTER,
        zoom: NL_DEFAULT_ZOOM,
        minZoom: 6.6,
        maxZoom: 17,
        maxBounds: NL_MAP_MAX_BOUNDS,
      });
      mapInstance = map;
      mapRef.current = map;

      map.on('style.load', () => {
        try {
          const layers = map.getStyle()?.layers ?? [];
          for (const layer of layers) {
            const id = layer.id.toLowerCase();
            if (
              layer.type === 'fill' &&
              (id.includes('water') || id.includes('ocean') || id.includes('river') || id.includes('lake'))
            ) {
              map.setPaintProperty(layer.id, 'fill-color', '#76c8ff');
            } else if (
              layer.type === 'line' &&
              (id.includes('water') || id.includes('river') || id.includes('canal'))
            ) {
              map.setPaintProperty(layer.id, 'line-color', '#5bb8fe');
            } else if (
              layer.type === 'fill' &&
              (id.includes('park') || id.includes('green') || id.includes('wood') || id.includes('grass'))
            ) {
              map.setPaintProperty(layer.id, 'fill-color', '#dff2e1');
            }
          }
        } catch {
          // Ignore paint property mismatches across vector tile versions
        }
      });

      renderMarkers(maplibregl, map, loadedVenues);
      fitMapToVenues(maplibregl, map, loadedVenues);
    }

    initMap().catch(() => {
      // Fallback stylized aquatic canvas remains visible if WebGL is unavailable
    });

    return () => {
      if (mapInstance) mapInstance.remove();
      mapRef.current = null;
    };
  }, [styleUrl]);

  // Update markers and camera bounds when loadedVenues changes
  useEffect(() => {
    async function syncMarkers() {
      if (!mapRef.current) return;
      const maplibregl = await import('maplibre-gl');
      renderMarkers(maplibregl, mapRef.current, loadedVenues);
      fitMapToVenues(maplibregl, mapRef.current, loadedVenues);
    }
    syncMarkers().catch(() => {});
  }, [loadedVenues]);

  // Highlight active/hovered marker classes on INNER button ONLY (never touch wrapperEl.className!)
  useEffect(() => {
    for (const item of markersRef.current) {
      const isSelected = selectedVenue?.id === item.id;
      const isHovered = hoveredVenueId === item.id;
      item.buttonEl.className = getMapMarkerButtonClasses(isSelected, isHovered);
      item.wrapperEl.style.zIndex = isSelected || isHovered ? '35' : '10';
    }
  }, [selectedVenue, hoveredVenueId]);

  function renderMarkers(maplibregl: MapLibreModule, map: MapLibreMap, list: VenueRow[]) {
    for (const old of markersRef.current) {
      old.marker.remove();
    }
    markersRef.current = [];

    const validList = filterValidMapVenues(list);
    for (const venue of validList) {
      // Outer wrapper owned by MapLibre (.maplibregl-marker + inline transform: translate(...))
      const wrapperEl = document.createElement('div');
      wrapperEl.dataset.venueId = venue.id;
      const isSelected = selectedVenue?.id === venue.id;
      const isHovered = hoveredVenueId === venue.id;
      wrapperEl.style.zIndex = isSelected || isHovered ? '35' : '10';

      // Inner button owned by Preact for hover/active colors
      const buttonEl = document.createElement('button');
      buttonEl.type = 'button';
      buttonEl.className = getMapMarkerButtonClasses(isSelected, isHovered);
      buttonEl.textContent = formatMapMarkerLabel(venue);
      buttonEl.setAttribute('aria-label', `${venue.name} (${formatMapMarkerLabel(venue)})`);

      buttonEl.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelectedVenue(venue);
      });

      wrapperEl.appendChild(buttonEl);

      const marker = new maplibregl.Marker({ element: wrapperEl, anchor: 'center' })
        .setLngLat([venue.lng, venue.lat])
        .addTo(map);

      markersRef.current.push({ id: venue.id, marker, wrapperEl, buttonEl });
    }
  }

  const selectedPhotos = selectedVenue ? parseVenuePhotos(selectedVenue) : [];
  const activeMapPhoto = selectedPhotos[selectedPhotoIndex] ?? selectedPhotos[0] ?? null;

  function stepMapPhoto(delta: number, e: Event) {
    e.preventDefault();
    e.stopPropagation();
    if (selectedPhotos.length <= 1) return;
    const next = (selectedPhotoIndex + delta + selectedPhotos.length) % selectedPhotos.length;
    setSelectedPhotoIndex(next);
    const trackEl = mapCardTrackRef.current;
    if (trackEl && trackEl.clientWidth > 0) {
      trackEl.scrollTo({ left: next * trackEl.clientWidth, behavior: 'smooth' });
    }
  }

  function selectMapPhotoDot(index: number, e: Event) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedPhotoIndex(index);
    const trackEl = mapCardTrackRef.current;
    if (trackEl && trackEl.clientWidth > 0) {
      trackEl.scrollTo({ left: index * trackEl.clientWidth, behavior: 'smooth' });
    }
  }

  function handleMapCardScroll(e: Event) {
    const el = e.currentTarget as HTMLDivElement;
    if (!el || el.clientWidth <= 0 || selectedPhotos.length === 0) return;
    const idx = Math.max(
      0,
      Math.min(selectedPhotos.length - 1, Math.round(el.scrollLeft / el.clientWidth))
    );
    if (idx !== selectedPhotoIndex) {
      setSelectedPhotoIndex(idx);
    }
  }

  return (
    <>
      {/* Mobile Floating "Kaart tonen" Button */}
      <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileMapOpen((prev) => !prev)}
          class="flex items-center gap-2 px-5 py-3 rounded-full bg-text-charcoal text-surface-pure font-bold text-xs shadow-2xl border border-surface-pure/20 active:scale-95 transition-transform"
        >
          <svg class="w-4 h-4 text-badge-teal-bg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z" />
          </svg>
          <span>{mobileMapOpen ? 'Lijst tonen' : `Kaart tonen (${loadedVenues.length})`}</span>
        </button>
      </div>

      <div
        class={`${
          mobileMapOpen
            ? 'fixed inset-x-3 top-24 bottom-20 z-30 block'
            : 'hidden lg:block relative w-full h-[calc(100vh-150px)] min-h-[540px]'
        } rounded-3xl overflow-hidden border border-border-hairline shadow-sm map-grid-pattern`}
      >
        {/* Stylized Aquatic Waterway Underlay (Visible during tile load or headless fallback) */}
        <svg
          class="absolute inset-0 w-full h-full opacity-55 pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M -50,180 C 120,200 220,140 380,240 C 480,300 620,220 800,260"
            fill="none"
            stroke="#5bb8fe"
            stroke-linecap="round"
            stroke-width="24"
          />
          <path
            d="M 140,-40 C 190,130 180,260 220,400 C 260,540 340,650 420,800"
            fill="none"
            stroke="#93ccff"
            stroke-linecap="round"
            stroke-width="16"
          />
          <path
            d="M 300,320 C 420,380 490,520 600,600"
            fill="none"
            stroke="#cce5ff"
            stroke-linecap="round"
            stroke-width="10"
          />
          <circle cx="460" cy="440" fill="#5bb8fe" opacity="0.55" r="52" />
          <circle cx="190" cy="170" fill="#5bb8fe" opacity="0.35" r="34" />
        </svg>

        {/* Live MapLibre Vector Canvas */}
        <div ref={mapContainerRef} class="w-full h-full relative z-10" />

        {/* Top-Left Floating Region Indicator */}
        <div class="absolute top-4 left-4 z-20 bg-surface-pure/95 backdrop-blur-md rounded-full px-3.5 py-1.5 shadow-md border border-border-hairline flex items-center gap-2">
          <span class="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span class="text-xs font-bold text-text-charcoal">{regionLabel}</span>
        </div>

        {/* Top-Right Quick Venue Pin Selector Pills */}
        <div class="absolute top-14 left-4 right-4 z-20 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 pointer-events-auto">
          {loadedVenues.slice(0, 6).map((v) => {
            const active = selectedVenue?.id === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  setSelectedVenue(v);
                  if (mapRef.current) {
                    try {
                      mapRef.current.flyTo({ center: [v.lng, v.lat], zoom: 13, duration: 500 });
                    } catch {
                      // Ignore flyTo in non-WebGL test env
                    }
                  }
                }}
                class={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold shadow-sm border transition-colors cursor-pointer ${
                  active
                    ? 'bg-text-charcoal text-surface-pure border-text-charcoal'
                    : 'bg-surface-pure/95 text-text-charcoal border-border-strong hover:bg-text-charcoal hover:text-surface-pure'
                }`}
              >
                {v.name.replace(/^Zwemcentrum |^Zwembad |^Sportfondsenbad /i, '').split(' - ')[0]} •{' '}
                {formatMapMarkerLabel(v)}
              </button>
            );
          })}
        </div>

        {/* Airbnb Floating Preview Card with Interactive Photo Switcher, Rating, Treatment & Price */}
        {selectedVenue && (
          <div class="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 w-72 sm:w-80 bg-surface-pure rounded-2xl p-3 shadow-2xl border border-border-hairline transition-all">
            {selectedPhotos.length > 0 && (
              <div class="relative aspect-[16/10] rounded-xl overflow-hidden mb-2.5 bg-surface-subtle group/mapcard">
                <div
                  ref={mapCardTrackRef}
                  onScroll={handleMapCardScroll}
                  role="group"
                  aria-roledescription="carousel"
                  aria-label={`Foto's van ${selectedVenue.name}`}
                  class="carousel-scroll-track no-scrollbar w-full h-full"
                >
                  {selectedPhotos.map((photo, idx) => (
                    <a
                      key={`${selectedVenue.id}-map-photo-${idx}`}
                      href={`/zwembad/${selectedVenue.municipality_slug}/${selectedVenue.slug}`}
                      role="group"
                      aria-roledescription="slide"
                      aria-label={`Kaartfoto ${idx + 1} van ${selectedPhotos.length}`}
                      class="carousel-scroll-slide block w-full h-full"
                    >
                      <img
                        src={photo.url}
                        alt={photo.alt_nl}
                        width="640"
                        height="400"
                        loading={idx === 0 ? 'eager' : 'lazy'}
                        decoding="async"
                        class="w-full h-full object-cover"
                      />
                    </a>
                  ))}
                </div>

                <span class="absolute top-2 left-2 z-10 pointer-events-none bg-text-charcoal/85 backdrop-blur-xs text-surface-pure text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                  {selectedVenue.venue_type === 'SUBTROPICAL_PARADISE'
                    ? 'Subtropisch'
                    : selectedVenue.venue_type === 'OPEN_WATER_NATURAL'
                      ? 'Natuurwater'
                      : activeMapPhoto?.badge_nl || 'Binnenbad'}
                </span>

                <button
                  type="button"
                  aria-label="Sluit kaartvoorbeeld"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedVenue(null);
                  }}
                  class="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-text-charcoal/75 text-surface-pure text-xs flex items-center justify-center hover:bg-text-charcoal cursor-pointer"
                >
                  ✕
                </button>

                {selectedPhotos.length > 1 && (
                  <>
                    <button
                      type="button"
                      data-testid="map-card-prev-photo"
                      aria-label="Vorige kaartfoto"
                      onClick={(e) => stepMapPhoto(-1, e)}
                      class="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-surface-pure/90 text-text-charcoal shadow-md flex items-center justify-center text-xs font-bold hover:scale-105 transition-transform cursor-pointer"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      data-testid="map-card-next-photo"
                      aria-label="Volgende kaartfoto"
                      onClick={(e) => stepMapPhoto(1, e)}
                      class="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-surface-pure/90 text-text-charcoal shadow-md flex items-center justify-center text-xs font-bold hover:scale-105 transition-transform cursor-pointer"
                    >
                      ›
                    </button>

                    <span class="absolute bottom-2 right-2 z-10 pointer-events-none bg-text-charcoal/75 text-surface-pure text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {selectedPhotoIndex + 1}/{selectedPhotos.length}
                    </span>

                    <div class="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 pointer-events-none">
                      {selectedPhotos.slice(0, 5).map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          aria-label={`Kaartfoto ${idx + 1}`}
                          aria-current={idx === selectedPhotoIndex ? 'true' : undefined}
                          onClick={(e) => selectMapPhotoDot(idx, e)}
                          class={`pointer-events-auto rounded-full transition-all cursor-pointer ${
                            idx === selectedPhotoIndex
                              ? 'w-2 h-2 bg-surface-pure shadow-xs'
                              : 'w-1.5 h-1.5 bg-surface-pure/60 hover:bg-surface-pure/90'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <a
              href={`/zwembad/${selectedVenue.municipality_slug}/${selectedVenue.slug}`}
              class="block group"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <h4 class="font-bold text-sm text-text-charcoal truncate group-hover:text-primary transition-colors">
                    {selectedVenue.name}
                  </h4>
                  <p class="text-xs text-text-muted truncate capitalize">
                    {selectedVenue.neighborhood_name ?? selectedVenue.municipality_slug}
                  </p>
                </div>
                {selectedVenue.rating_score && (
                  <span class="text-xs font-bold text-text-charcoal shrink-0">
                    ★ {selectedVenue.rating_score.toFixed(2)}
                  </span>
                )}
              </div>

              <div class="mt-2.5 pt-2 border-t border-border-hairline flex items-center justify-between gap-1.5 text-xs">
                <span class="font-extrabold text-text-charcoal">
                  {selectedVenue.min_single_price_cents === 0
                    ? 'Gratis toegang'
                    : selectedVenue.min_single_price_cents
                      ? `${formatEuroCentsNl(selectedVenue.min_single_price_cents)} / entree`
                      : selectedVenue.venue_type === 'OPEN_WATER_NATURAL'
                        ? 'Betaald terrein'
                        : 'Bekijk tarieven'}
                </span>
                <div class="flex items-center gap-1">
                  <span
                    class={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      selectedVenue.primary_water_treatment === 'SALT_ELECTROLYSIS'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : selectedVenue.primary_water_treatment === 'NATURAL_UNTREATED'
                          ? 'bg-cyan-50 text-cyan-800 border border-cyan-200'
                          : 'bg-badge-teal-bg text-primary'
                    }`}
                  >
                    {selectedVenue.primary_water_treatment === 'SALT_ELECTROLYSIS'
                      ? '💧 Zout'
                      : selectedVenue.primary_water_treatment === 'NATURAL_UNTREATED'
                        ? '🌊 Schoon'
                        : 'Chloor'}
                  </span>
                  {selectedVenue.default_temp_celsius && (
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-badge-teal-bg text-primary">
                      {selectedVenue.default_temp_celsius.toFixed(1)}°C Bad
                    </span>
                  )}
                </div>
              </div>
            </a>

            {/* Active Pill Pointer Below Card */}
            <div class="mt-2.5 flex justify-center">
              <span class="inline-flex items-center gap-1 bg-text-charcoal text-surface-pure font-extrabold text-xs px-3 py-1 rounded-full shadow-md">
                {formatMapMarkerLabel(selectedVenue)} ✓
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
