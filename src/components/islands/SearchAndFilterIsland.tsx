import { useEffect, useState } from 'preact/hooks';
import type { VenueRow } from '../../db/queries';
import { formatEuroCentsNl } from '../../domain/seo-aggregator';
import { parseVenuePhotos } from '../../domain/venue-photos';
import {
  FEATURED_DUTCH_CITIES,
  rankVenuesByUserLocation,
  rankVenuesMultiCityRecommended,
} from '../../domain/multi-city-ranking';
import { haversineDistanceKm } from '../../db/geo';

export interface SearchAndFilterIslandProps {
  venues: VenueRow[];
}

export type CategoryFilter =
  | 'ALL'
  | 'ZWEMLES'
  | 'BANENZWEMMEN'
  | 'SUBTROPISCH'
  | 'BUITEN'
  | 'BINNEN'
  | 'WELLNESS';

export type SortMode =
  | 'RECOMMENDED'
  | 'NEAREST_ME'
  | 'HIGHEST_RATING'
  | 'SHORTEST_WAITLIST'
  | 'WARMEST_WATER';

export default function SearchAndFilterIsland({ venues }: SearchAndFilterIslandProps) {
  const [query, setQuery] = useState('');
  const [selectedCitySlug, setSelectedCitySlug] = useState<string>('ALL');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatusNl, setGeoStatusNl] = useState<string | null>(null);
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [sortMode, setSortMode] = useState<SortMode>('RECOMMENDED');
  const [treatmentFilter, setTreatmentFilter] = useState<
    'ALL' | 'SALT_ELECTROLYSIS' | 'TRADITIONAL_CHLORINE' | 'NATURAL_UNTREATED'
  >('ALL');
  const [visibleCount, setVisibleCount] = useState(24);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [photoIndexByVenue, setPhotoIndexByVenue] = useState<Record<string, number>>({});
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [onlyWheelchairAccessible, setOnlyWheelchairAccessible] = useState(false);
  const [onlyNrzLicensed, setOnlyNrzLicensed] = useState(false);

  // Hydrate initial URL query params and localStorage favorites
  useEffect(() => {
    try {
      const savedFavs = localStorage.getItem('zwemkaart_favorites');
      if (savedFavs) {
        setFavorites(JSON.parse(savedFavs));
      }
      const params = new URLSearchParams(window.location.search);
      if (params.get('q')) setQuery(params.get('q')!);
      if (params.get('stad')) setSelectedCitySlug(params.get('stad')!);
      const catParam = params.get('cat') as CategoryFilter | null;
      if (catParam) setCategory(catParam);
    } catch {
      // Ignore storage access errors
    }

    function handleHeaderSearch(e: Event) {
      const detail = (e as CustomEvent<{ query: string; category: CategoryFilter }>).detail;
      if (!detail) return;
      setQuery(detail.query ?? '');
      if (detail.category) setCategory(detail.category);
      setVisibleCount(24);
    }

    function handleExternalCategory(e: Event) {
      const detail = (e as CustomEvent<{ category: CategoryFilter }>).detail;
      if (!detail) return;
      setCategory(detail.category);
      setVisibleCount(24);
    }

    function handleOpenFiltersModal() {
      setIsFiltersModalOpen(true);
    }

    window.addEventListener('zwemkaart:search', handleHeaderSearch);
    window.addEventListener('zwemkaart:set-category', handleExternalCategory);
    window.addEventListener('zwemkaart:open-filters', handleOpenFiltersModal);
    return () => {
      window.removeEventListener('zwemkaart:search', handleHeaderSearch);
      window.removeEventListener('zwemkaart:set-category', handleExternalCategory);
      window.removeEventListener('zwemkaart:open-filters', handleOpenFiltersModal);
    };
  }, []);

  function handleLocateMe() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoStatusNl('Locatievoorziening niet beschikbaar in deze browser.');
      return;
    }
    setGeoStatusNl('Bezig met locatie bepalen...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSelectedCitySlug('ALL');
        setSortMode('NEAREST_ME');
        setVisibleCount(24);
        setGeoStatusNl('Gesorteerd op afstand vanaf jouw locatie');
      },
      () => {
        setGeoStatusNl('Locatietoegang geweigerd — kies hiernaast je stad.');
      },
      { enableHighAccuracy: false, timeout: 6000 }
    );
  }

  function toggleFavorite(venueId: string, e: Event) {
    e.preventDefault();
    e.stopPropagation();
    setFavorites((prev) => {
      const next = prev.includes(venueId) ? prev.filter((id) => id !== venueId) : [...prev, venueId];
      try {
        localStorage.setItem('zwemkaart_favorites', JSON.stringify(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  }

  function stepPhoto(venueId: string, total: number, delta: number, e: Event) {
    e.preventDefault();
    e.stopPropagation();
    setPhotoIndexByVenue((prev) => {
      const current = prev[venueId] ?? 0;
      const next = (current + delta + total) % total;
      return { ...prev, [venueId]: next };
    });
  }

  const baseMatches = venues.filter((v) => {
    const q = query.trim().toLowerCase();
    const matchesText =
      q === '' ||
      v.name.toLowerCase().includes(q) ||
      v.municipality_slug.toLowerCase().includes(q) ||
      (v.neighborhood_name ?? '').toLowerCase().includes(q) ||
      (v.postcode_pc4 ?? '').includes(q);

    const matchesCity = selectedCitySlug === 'ALL' || v.municipality_slug === selectedCitySlug;

    const matchesTreatment =
      treatmentFilter === 'ALL' || v.primary_water_treatment === treatmentFilter;

    let matchesCategory = true;
    if (category === 'ZWEMLES') {
      matchesCategory = v.is_nrz_licensed === 1 || (v.min_waitlist_weeks ?? 0) > 0;
    } else if (category === 'BANENZWEMMEN') {
      matchesCategory =
        v.venue_type === 'INDOOR_ONLY' ||
        v.venue_type === 'INDOOR_AND_OUTDOOR' ||
        v.venue_type === 'OUTDOOR_SEASONAL_POOL' ||
        v.slug === 'de-mirandabad';
    } else if (category === 'SUBTROPISCH') {
      matchesCategory = v.venue_type === 'SUBTROPICAL_PARADISE';
    } else if (category === 'BUITEN') {
      matchesCategory =
        v.venue_type === 'OPEN_WATER_NATURAL' ||
        v.venue_type === 'OUTDOOR_SEASONAL_POOL' ||
        v.venue_type === 'INDOOR_AND_OUTDOOR';
    } else if (category === 'BINNEN') {
      matchesCategory =
        v.venue_type !== 'OPEN_WATER_NATURAL' && v.venue_type !== 'OUTDOOR_SEASONAL_POOL';
    } else if (category === 'WELLNESS') {
      matchesCategory =
        v.primary_water_treatment === 'SALT_ELECTROLYSIS' ||
        v.venue_type === 'SUBTROPICAL_PARADISE' ||
        v.venue_type === 'BOUTIQUE_SWIM_SCHOOL_POOL' ||
        (v.default_temp_celsius ?? 0) >= 30;
    }

    const matchesWheelchair = !onlyWheelchairAccessible || v.has_wheelchair_lift === 1;
    const matchesNrz = !onlyNrzLicensed || v.is_nrz_licensed === 1;

    return (
      matchesText &&
      matchesCity &&
      matchesTreatment &&
      matchesCategory &&
      matchesWheelchair &&
      matchesNrz
    );
  });

  let filtered: VenueRow[];
  if (sortMode === 'NEAREST_ME' && userCoords) {
    filtered = rankVenuesByUserLocation(baseMatches, userCoords.lat, userCoords.lng);
  } else if (sortMode === 'HIGHEST_RATING') {
    filtered = [...baseMatches].sort((a, b) => (b.rating_score ?? 0) - (a.rating_score ?? 0));
  } else if (sortMode === 'SHORTEST_WAITLIST') {
    filtered = [...baseMatches].sort(
      (a, b) => (a.min_waitlist_weeks ?? 999) - (b.min_waitlist_weeks ?? 999)
    );
  } else if (sortMode === 'WARMEST_WATER') {
    filtered = [...baseMatches].sort(
      (a, b) => (b.default_temp_celsius ?? 0) - (a.default_temp_celsius ?? 0)
    );
  } else if (selectedCitySlug === 'ALL' && query.trim() === '') {
    // Diverse national multi-city interleaving by default
    filtered = rankVenuesMultiCityRecommended(baseMatches);
  } else {
    filtered = [...baseMatches].sort((a, b) => (b.rating_score ?? 0) - (a.rating_score ?? 0));
  }

  const activeFilterCount =
    (selectedCitySlug !== 'ALL' ? 1 : 0) +
    (category !== 'ALL' ? 1 : 0) +
    (treatmentFilter !== 'ALL' ? 1 : 0) +
    (sortMode !== 'RECOMMENDED' ? 1 : 0) +
    (onlyWheelchairAccessible ? 1 : 0) +
    (onlyNrzLicensed ? 1 : 0);

  const displayed = filtered.slice(0, visibleCount);
  const firstFour = displayed.slice(0, 4);
  const remainingAfterBanner = displayed.slice(4);

  const selectedCityObj = FEATURED_DUTCH_CITIES.find((c) => c.slug === selectedCitySlug);

  // Broadcast ONLY the currently loaded (`displayed`) venues to ListingMapIsland
  useEffect(() => {
    try {
      window.dispatchEvent(
        new CustomEvent('zwemkaart:filtered', {
          detail: {
            venues: displayed,
            totalFiltered: filtered.length,
            query,
            cityLabel:
              sortMode === 'NEAREST_ME'
                ? 'Dichtbij jouw locatie'
                : selectedCityObj
                  ? selectedCityObj.labelNl
                  : 'ALL',
          },
        })
      );
      window.dispatchEvent(
        new CustomEvent('zwemkaart:category-changed', {
          detail: { category, activeFilterCount },
        })
      );
    } catch {
      // Ignore in non-DOM test env
    }
  }, [
    query,
    selectedCitySlug,
    userCoords,
    category,
    sortMode,
    treatmentFilter,
    onlyWheelchairAccessible,
    onlyNrzLicensed,
    visibleCount,
  ]);

  function renderCard(venue: VenueRow) {
    const href = `/zwembad/${venue.municipality_slug}/${venue.slug}`;
    const photos = parseVenuePhotos(venue);
    const activeIdx = photoIndexByVenue[venue.id] ?? 0;
    const currentPhoto = photos[activeIdx] ?? photos[0];
    const isFav = favorites.includes(venue.id);

    const cityLabel =
      venue.neighborhood_name ??
      venue.municipality_slug.charAt(0).toUpperCase() + venue.municipality_slug.slice(1);
    let subtitleNl = venue.default_basin_name_nl
      ? `${cityLabel} • ${venue.default_basin_name_nl}`
      : cityLabel;
    if (venue.slug === 'sportfondsenbad-oost') subtitleNl = 'Amsterdam • 25m Wedstrijdbad & Peuterbad';
    if (venue.slug === 'de-mirandabad') subtitleNl = 'Amsterdam • Subtropisch golfslagbad & Buitenbad';
    if (venue.slug === 'sloterparkbad') subtitleNl = 'Amsterdam • Diploma A, B & C Specialist';
    if (venue.slug === 'gaasperplas-open-water') subtitleNl = 'Amsterdam • Natuurwater keurmerk';
    if (venue.slug === 'tongelreep-zwemparadijs') subtitleNl = 'Eindhoven • 50m Olympisch bad & Recreatie';
    if (venue.slug === 'ra-sports-swimming-utrecht') subtitleNl = 'Utrecht • Privéles & Kleine groepen';

    if (sortMode === 'NEAREST_ME' && userCoords) {
      const distKm = haversineDistanceKm(userCoords.lat, userCoords.lng, venue.lat, venue.lng);
      subtitleNl = `${distKm.toFixed(1)} km afstand • ${cityLabel}`;
    }

    const isOpenWater = venue.venue_type === 'OPEN_WATER_NATURAL';
    const temp = venue.default_temp_celsius;

    return (
      <article
        key={venue.id}
        onMouseEnter={() => {
          window.dispatchEvent(
            new CustomEvent('zwemkaart:hover-venue', { detail: { venueId: venue.id } })
          );
        }}
        onMouseLeave={() => {
          window.dispatchEvent(
            new CustomEvent('zwemkaart:hover-venue', { detail: { venueId: null } })
          );
        }}
        class="group flex flex-col transition-all"
      >
        {/* Airbnb Aspect 20/19 Image Carousel Container */}
        <div class="relative aspect-[20/19] rounded-2xl overflow-hidden bg-surface-subtle mb-3 shadow-2xs">
          <a href={href} class="block w-full h-full">
            <img
              src={currentPhoto.url}
              alt={currentPhoto.alt_nl}
              loading="lazy"
              decoding="async"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </a>

          {/* Top-Left Featured Badge */}
          {venue.featured_badge_nl && (
            <span
              class={`absolute top-3 left-3 text-[11px] px-2.5 py-1 rounded-full font-bold shadow-sm flex items-center gap-1 pointer-events-none ${
                venue.venue_type === 'OPEN_WATER_NATURAL'
                  ? 'bg-accent-seasonal text-on-primary'
                  : venue.featured_badge_nl === 'Populairste Keuze'
                    ? 'bg-text-charcoal text-surface-pure'
                    : venue.featured_badge_nl.includes('NRZ')
                      ? 'bg-primary-container text-on-primary'
                      : 'bg-badge-teal-bg text-primary-container border border-primary/20'
              }`}
            >
              {venue.featured_badge_nl.includes('NRZ') && <span>✓</span>}
              {venue.featured_badge_nl}
            </span>
          )}

          {/* Top-Right Heart Favorite Trigger */}
          <button
            type="button"
            aria-label={isFav ? 'Verwijder uit favorieten' : 'Bewaar als favoriet'}
            onClick={(e) => toggleFavorite(venue.id, e)}
            class="absolute top-3 right-3 w-8 h-8 rounded-full bg-surface-pure/85 backdrop-blur-xs flex items-center justify-center text-text-charcoal hover:scale-110 transition-all shadow-sm cursor-pointer"
          >
            <svg
              class={`w-4 h-4 ${isFav ? 'text-rose-500 fill-rose-500' : 'text-text-charcoal'}`}
              viewBox="0 0 24 24"
              fill={isFav ? 'currentColor' : 'none'}
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>

          {/* Prev / Next Carousel Buttons on Hover */}
          {photos.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Vorige foto"
                onClick={(e) => stepPhoto(venue.id, photos.length, -1, e)}
                class="opacity-0 group-hover:opacity-100 absolute left-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-surface-pure/90 text-text-charcoal shadow-md flex items-center justify-center text-xs font-bold hover:scale-105 transition-all cursor-pointer"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Volgende foto"
                onClick={(e) => stepPhoto(venue.id, photos.length, 1, e)}
                class="opacity-0 group-hover:opacity-100 absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-surface-pure/90 text-text-charcoal shadow-md flex items-center justify-center text-xs font-bold hover:scale-105 transition-all cursor-pointer"
              >
                ›
              </button>
            </>
          )}

          {/* Carousel Dots Indicator */}
          <div class="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-none">
            {photos.slice(0, 4).map((_, idx) => (
              <span
                key={idx}
                class={`rounded-full transition-all ${
                  idx === activeIdx % 4
                    ? 'w-2 h-2 bg-surface-pure shadow-xs'
                    : 'w-1.5 h-1.5 bg-surface-pure/60'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Title & Star Rating */}
        <div class="flex justify-between items-start gap-2">
          <a
            href={href}
            class="text-[17px] leading-snug font-bold text-text-charcoal group-hover:text-primary-container transition-colors line-clamp-1"
          >
            {venue.name}
          </a>
          {venue.rating_score && (
            <span class="flex items-center gap-1 text-xs font-bold text-text-charcoal shrink-0 mt-0.5">
              <span>★ {venue.rating_score.toFixed(2)}</span>
              <span class="text-text-muted font-normal">({venue.rating_count})</span>
            </span>
          )}
        </div>

        {/* Subtitle */}
        <p class="text-sm text-text-muted mt-0.5 line-clamp-1">{subtitleNl}</p>

        {/* Live Condition / Waitlist / Temperature Badge + Water Treatment Pill */}
        <div class="mt-2 flex flex-wrap items-center gap-1.5">
          {isOpenWater ? (
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] bg-badge-amber-bg text-accent-seasonal font-bold border border-accent-seasonal/25">
              <span>❄️</span>
              <span>
                {temp
                  ? `Watertemp: ${temp.toFixed(1)}°C • Wetsuit vereist (3-5mm)`
                  : 'Natuurwater • Rijkswaterstaat controle'}
              </span>
            </span>
          ) : category === 'ZWEMLES' || venue.slug === 'sloterparkbad' || venue.slug === 'ra-sports-swimming-utrecht' ? (
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] bg-badge-teal-bg text-primary-container font-bold">
              <span>⏳</span>
              <span>
                {venue.min_waitlist_weeks
                  ? `Zwemles A • Wachttijd: ~${venue.min_waitlist_weeks} weken`
                  : 'Zwemles A/B/C • Direct plek!'}
              </span>
            </span>
          ) : (
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] bg-badge-teal-bg text-primary-container font-bold">
              <span>🌡️</span>
              <span>
                Watertemp: {(temp ?? 28.0).toFixed(1)}°C •{' '}
                {venue.venue_type === 'SUBTROPICAL_PARADISE' ? 'Golfslagbad actief' : 'Binnen open'}
              </span>
            </span>
          )}

          {/* Water Treatment Pill */}
          {venue.primary_water_treatment === 'SALT_ELECTROLYSIS' ? (
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
              <span class="text-emerald-600">💧</span>
              <span>Zoutelektrolyse (Huidvriendelijk)</span>
            </span>
          ) : venue.primary_water_treatment === 'NATURAL_UNTREATED' ? (
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-800 border border-cyan-200/80">
              <span class="text-cyan-600">🌊</span>
              <span>Natuurwater (Onbehandeld / Schoon)</span>
            </span>
          ) : (
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-subtle text-text-charcoal border border-border-hairline">
              <span>🧪</span>
              <span>Klassiek Chloor</span>
            </span>
          )}
        </div>

        {/* Pricing Footer */}
        <div class="mt-2.5 flex items-baseline justify-between gap-2">
          <div class="flex items-baseline gap-1">
            {category === 'ZWEMLES' && venue.min_zwemles_monthly_cents ? (
              <>
                <span class="text-sm font-extrabold text-text-charcoal">
                  Vanaf {formatEuroCentsNl(venue.min_zwemles_monthly_cents)}
                </span>
                <span class="text-xs text-text-muted">/ maand (incl. diplomagarantie)</span>
              </>
            ) : venue.min_single_price_cents === 0 ? (
              <>
                <span class="text-sm font-extrabold text-text-charcoal">Gratis toegang</span>
                <span class="text-xs text-text-muted">• Officiële zwemzone</span>
              </>
            ) : venue.min_single_price_cents ? (
              <>
                <span class="text-sm font-extrabold text-text-charcoal">
                  Vanaf {formatEuroCentsNl(venue.min_single_price_cents)}
                </span>
                <span class="text-xs text-text-muted">per entree</span>
              </>
            ) : isOpenWater ? (
              <>
                <span class="text-sm font-extrabold text-text-charcoal">Betaald terrein</span>
                <span class="text-xs text-text-muted">• Recreatiepark / strand</span>
              </>
            ) : (
              <span class="text-sm font-bold text-text-charcoal">Prijs op aanvraag</span>
            )}
          </div>
          <a href={href} class="text-xs font-bold text-primary hover:underline shrink-0">
            Bekijk rooster →
          </a>
        </div>
      </article>
    );
  }

  return (
    <div id="venue-results-top" class="space-y-6">
      {/* Section Header with Stats, Multi-City Switcher, Search Input & Sorting Pills */}
      <div class="flex flex-col gap-3 pb-3 border-b border-border-hairline">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h1 class="text-xl md:text-2xl font-extrabold text-text-charcoal tracking-tight">
            {selectedCityObj
              ? `Zwembaden & Zwemwater in ${selectedCityObj.labelNl} (${filtered.length})`
              : `Meer dan 480 zwemlocaties in Nederland (${displayed.length} van ${filtered.length} geladen)`}
          </h1>
          <span class="text-xs text-text-muted">
            {geoStatusNl || 'Kaartweergave synchroon met geladen baden'}
          </span>
        </div>

        {/* Quick Multi-City & "Dichtbij mij" Geolocation Bar (Issue #3) */}
        <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          <button
            type="button"
            onClick={() => {
              setSelectedCitySlug('ALL');
              setSortMode('RECOMMENDED');
              setVisibleCount(24);
            }}
            class={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
              selectedCitySlug === 'ALL' && sortMode !== 'NEAREST_ME'
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-surface-pure text-text-charcoal border-border-hairline hover:border-primary'
            }`}
          >
            🇳🇱 Heel Nederland
          </button>

          <button
            type="button"
            onClick={handleLocateMe}
            class={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
              sortMode === 'NEAREST_ME'
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-badge-teal-bg text-primary border-primary/25 hover:bg-primary hover:text-on-primary'
            }`}
          >
            <span>📍</span>
            <span>Dichtbij mij</span>
          </button>

          {FEATURED_DUTCH_CITIES.map((city) => {
            const active = selectedCitySlug === city.slug;
            return (
              <button
                key={city.slug}
                type="button"
                onClick={() => {
                  setSelectedCitySlug(active ? 'ALL' : city.slug);
                  if (sortMode === 'NEAREST_ME') setSortMode('RECOMMENDED');
                  setVisibleCount(24);
                }}
                class={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                  active
                    ? 'bg-text-charcoal text-surface-pure border-text-charcoal font-bold'
                    : 'bg-surface-subtle text-text-charcoal border-border-hairline hover:border-text-charcoal'
                }`}
              >
                {city.labelNl}
              </button>
            );
          })}

          <a
            href="/steden"
            class="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold text-primary hover:underline"
          >
            Alle 342 gemeenten →
          </a>
        </div>

        {/* Accessible Quick Search Bar (Synced with Header 3-Segment Capsule) */}
        <div class="flex flex-wrap items-center gap-2">
          <label htmlFor="venue-search-input" class="sr-only">
            Zoek op stad, zwembad of postcode
          </label>
          <input
            id="venue-search-input"
            type="search"
            value={query}
            onInput={(e) => {
              setQuery((e.target as HTMLInputElement).value);
              setVisibleCount(24);
            }}
            placeholder="Zoek op stad, zwembad of 4-cijferige postcode (bijv. Rotterdam, Utrecht, 1079)..."
            class="flex-1 min-w-[230px] px-4 py-2 rounded-full border border-border-strong bg-surface-pure text-xs md:text-sm focus:outline-none focus:border-primary shadow-2xs"
          />
          {(query !== '' || activeFilterCount > 0) && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSelectedCitySlug('ALL');
                setCategory('ALL');
                setSortMode('RECOMMENDED');
                setTreatmentFilter('ALL');
                setOnlyWheelchairAccessible(false);
                setOnlyNrzLicensed(false);
                setGeoStatusNl(null);
              }}
              class="px-3.5 py-2 rounded-full text-xs font-bold text-primary bg-badge-teal-bg hover:opacity-90 cursor-pointer"
            >
              Reset filters ✕
            </button>
          )}
        </div>

        {/* Sorting & Water Treatment Pills (Exact Match to Photo 2) */}
        <div class="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <button
            type="button"
            onClick={() => {
              setSortMode('RECOMMENDED');
              setTreatmentFilter('ALL');
            }}
            class={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
              sortMode === 'RECOMMENDED' && treatmentFilter === 'ALL'
                ? 'bg-text-charcoal text-surface-pure border-text-charcoal shadow-2xs'
                : 'bg-surface-subtle hover:bg-surface-container text-text-charcoal border-border-hairline'
            }`}
          >
            Aanbevolen
          </button>

          <button
            type="button"
            onClick={() => setSortMode('HIGHEST_RATING')}
            class={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
              sortMode === 'HIGHEST_RATING'
                ? 'bg-text-charcoal text-surface-pure border-text-charcoal shadow-2xs'
                : 'bg-surface-subtle hover:bg-surface-container text-text-charcoal border-border-hairline'
            }`}
          >
            Hoogste waardering ★
          </button>

          <button
            type="button"
            onClick={() => setSortMode('SHORTEST_WAITLIST')}
            class={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
              sortMode === 'SHORTEST_WAITLIST'
                ? 'bg-text-charcoal text-surface-pure border-text-charcoal shadow-2xs'
                : 'bg-surface-subtle hover:bg-surface-container text-text-charcoal border-border-hairline'
            }`}
          >
            Kortste wachttijd les
          </button>

          <button
            type="button"
            onClick={() => setSortMode('WARMEST_WATER')}
            class={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
              sortMode === 'WARMEST_WATER'
                ? 'bg-text-charcoal text-surface-pure border-text-charcoal shadow-2xs'
                : 'bg-surface-subtle hover:bg-surface-container text-text-charcoal border-border-hairline'
            }`}
          >
            Watertemperatuur (Warmste)
          </button>

          <button
            type="button"
            onClick={() =>
              setTreatmentFilter((prev) =>
                prev === 'SALT_ELECTROLYSIS' ? 'ALL' : 'SALT_ELECTROLYSIS'
              )
            }
            class={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
              treatmentFilter === 'SALT_ELECTROLYSIS'
                ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                : 'bg-surface-pure hover:border-text-charcoal text-text-charcoal border-border-hairline'
            }`}
          >
            <span class="text-primary">💧</span>
            <span>Zoutelektrolyse (Zoutwater)</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setTreatmentFilter((prev) =>
                prev === 'TRADITIONAL_CHLORINE' ? 'ALL' : 'TRADITIONAL_CHLORINE'
              )
            }
            class={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
              treatmentFilter === 'TRADITIONAL_CHLORINE'
                ? 'bg-text-charcoal text-surface-pure border-text-charcoal shadow-2xs'
                : 'bg-surface-pure hover:border-text-charcoal text-text-charcoal border-border-hairline'
            }`}
          >
            <span class="text-primary">🧪</span>
            <span>Klassiek Chloor</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setTreatmentFilter((prev) =>
                prev === 'NATURAL_UNTREATED' ? 'ALL' : 'NATURAL_UNTREATED'
              )
            }
            class={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
              treatmentFilter === 'NATURAL_UNTREATED'
                ? 'bg-cyan-800 text-white border-cyan-800 shadow-2xs'
                : 'bg-surface-pure hover:border-text-charcoal text-text-charcoal border-border-hairline'
            }`}
          >
            <span class="text-cyan-600">🌊</span>
            <span>Natuurwater</span>
          </button>
        </div>
      </div>

      {/* First 4 Listing Cards (2x2 Grid) */}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-8">
        {firstFour.map(renderCard)}
      </div>

      {/* Native Editorial Seasonal Banner Embedded in the Feed (Photo 3) */}
      {displayed.length >= 2 && (
        <section class="rounded-2xl border border-border-hairline bg-gradient-to-r from-badge-amber-bg via-surface-pure to-badge-teal-bg/30 p-6 md:p-7 my-2 shadow-2xs relative overflow-hidden">
          <div class="relative z-10 max-w-xl">
            <div class="inline-flex items-center gap-2 bg-surface-pure border border-border-hairline rounded-full px-3 py-1 mb-3 shadow-2xs">
              <span class="text-accent-seasonal text-sm">☀️</span>
              <span class="text-[11px] font-bold text-text-charcoal">
                Rijkswaterstaat Zwemveiligheid Herfst &amp; Winter
              </span>
            </div>
            <h3 class="text-xl font-extrabold text-text-charcoal mb-2">
              Buitenzwemmen stopt niet in de herfst
            </h3>
            <p class="text-sm text-text-muted mb-4 leading-relaxed">
              Zwemmen bij watertemperaturen onder 15°C stimuleert de bloedsomloop en mentale veerkracht. Zorg voor geteste thermische bescherming en zwem volgens de officiële veiligheidsnormen.
            </p>
            <div class="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setCategory('BUITEN');
                  setVisibleCount(24);
                  document
                    .getElementById('venue-results-top')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }}
                class="inline-flex items-center gap-2 bg-text-charcoal hover:bg-black text-surface-pure text-xs font-bold px-5 py-2.5 rounded-full transition-all shadow-sm cursor-pointer"
              >
                <span>Bekijk open-water locaties &amp; advies</span>
                <span>→</span>
              </button>
              <span class="text-xs text-text-muted flex items-center gap-1">
                <span class="text-accent-seasonal">⚠️</span>
                Zwem altijd met een zichtbare boei
              </span>
            </div>
          </div>
          <div class="absolute -right-10 -bottom-10 w-56 h-56 rounded-full bg-accent-seasonal/10 blur-3xl pointer-events-none"></div>
        </section>
      )}

      {/* Remaining Listing Cards */}
      {remainingAfterBanner.length > 0 && (
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-8">
          {remainingAfterBanner.map(renderCard)}
        </div>
      )}

      {filtered.length === 0 && (
        <div class="p-8 rounded-2xl border border-border-hairline bg-surface-subtle text-center space-y-3">
          <p class="text-base font-bold text-text-charcoal">
            Geen zwemlocaties gevonden voor deze filtercombinatie.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSelectedCitySlug('ALL');
              setCategory('ALL');
              setTreatmentFilter('ALL');
              setOnlyWheelchairAccessible(false);
              setOnlyNrzLicensed(false);
            }}
            class="px-5 py-2 rounded-full bg-primary text-on-primary text-xs font-bold cursor-pointer"
          >
            Toon alle {venues.length} zwemlocaties
          </button>
        </div>
      )}

      {/* Pagination / Load More Bar */}
      {filtered.length > visibleCount && (
        <div class="pt-4 pb-8 text-center border-t border-border-hairline">
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => prev + 24)}
            class="px-6 py-3 rounded-full bg-text-charcoal text-surface-pure hover:bg-primary font-bold text-xs md:text-sm transition-all shadow-sm cursor-pointer"
          >
            Toon meer zwemlocaties (+24 op lijst &amp; kaart • nog {filtered.length - visibleCount} beschikbaar) ↓
          </button>
        </div>
      )}

      {/* Filters Modal (Triggered by the "Filters" button in the Sticky Category Bar) */}
      {isFiltersModalOpen && (
        <div class="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div class="bg-surface-pure rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-border-hairline space-y-5">
            <div class="flex items-center justify-between border-b border-border-hairline pb-3">
              <h3 class="text-lg font-extrabold text-text-charcoal">Filters &amp; Voorkeuren</h3>
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(false)}
                class="w-8 h-8 rounded-full bg-surface-subtle flex items-center justify-center text-text-charcoal font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div class="space-y-3">
              <p class="text-xs font-bold uppercase tracking-wider text-text-muted">Waterbehandeling</p>
              <div class="grid grid-cols-2 gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setTreatmentFilter('ALL')}
                  class={`p-3 rounded-xl border text-left cursor-pointer ${
                    treatmentFilter === 'ALL'
                      ? 'border-primary bg-badge-teal-bg text-primary font-bold'
                      : 'border-border-hairline bg-surface-subtle'
                  }`}
                >
                  Alle watertypes
                </button>
                <button
                  type="button"
                  onClick={() => setTreatmentFilter('SALT_ELECTROLYSIS')}
                  class={`p-3 rounded-xl border text-left cursor-pointer ${
                    treatmentFilter === 'SALT_ELECTROLYSIS'
                      ? 'border-emerald-700 bg-emerald-50 text-emerald-900 font-bold'
                      : 'border-border-hairline bg-surface-subtle'
                  }`}
                >
                  💧 Zoutelektrolyse (Zacht)
                </button>
                <button
                  type="button"
                  onClick={() => setTreatmentFilter('TRADITIONAL_CHLORINE')}
                  class={`p-3 rounded-xl border text-left cursor-pointer ${
                    treatmentFilter === 'TRADITIONAL_CHLORINE'
                      ? 'border-primary bg-badge-teal-bg text-primary font-bold'
                      : 'border-border-hairline bg-surface-subtle'
                  }`}
                >
                  🧪 Klassiek Chloor
                </button>
                <button
                  type="button"
                  onClick={() => setTreatmentFilter('NATURAL_UNTREATED')}
                  class={`p-3 rounded-xl border text-left cursor-pointer ${
                    treatmentFilter === 'NATURAL_UNTREATED'
                      ? 'border-cyan-700 bg-cyan-50 text-cyan-900 font-bold'
                      : 'border-border-hairline bg-surface-subtle'
                  }`}
                >
                  🌊 Schoon Natuurwater
                </button>
              </div>
            </div>

            <div class="space-y-2.5 pt-2 border-t border-border-hairline">
              <p class="text-xs font-bold uppercase tracking-wider text-text-muted">Keurmerken &amp; Toegankelijkheid</p>
              <label htmlFor="filter-nrz-checkbox" class="flex items-center gap-3 text-sm text-text-charcoal cursor-pointer">
                <input
                  id="filter-nrz-checkbox"
                  type="checkbox"
                  checked={onlyNrzLicensed}
                  onChange={(e) => setOnlyNrzLicensed((e.target as HTMLInputElement).checked)}
                  class="w-4 h-4 rounded accent-primary"
                />
                <span>Alleen officiële NRZ Zwem-ABC licentiehouders</span>
              </label>
              <label htmlFor="filter-wheelchair-checkbox" class="flex items-center gap-3 text-sm text-text-charcoal cursor-pointer">
                <input
                  id="filter-wheelchair-checkbox"
                  type="checkbox"
                  checked={onlyWheelchairAccessible}
                  onChange={(e) => setOnlyWheelchairAccessible((e.target as HTMLInputElement).checked)}
                  class="w-4 h-4 rounded accent-primary"
                />
                <span>Rolstoellift &amp; drempelvrije kleedruimtes aanwezig</span>
              </label>
            </div>

            <div class="flex items-center justify-between pt-4 border-t border-border-hairline">
              <button
                type="button"
                onClick={() => {
                  setSelectedCitySlug('ALL');
                  setCategory('ALL');
                  setTreatmentFilter('ALL');
                  setOnlyWheelchairAccessible(false);
                  setOnlyNrzLicensed(false);
                }}
                class="text-xs font-bold underline text-text-muted hover:text-text-charcoal cursor-pointer"
              >
                Alles wissen
              </button>
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(false)}
                class="px-6 py-2.5 rounded-full bg-text-charcoal text-surface-pure text-xs font-bold cursor-pointer"
              >
                Toon {filtered.length} locaties
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
