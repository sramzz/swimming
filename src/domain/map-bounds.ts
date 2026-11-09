import type { VenueRow } from '../db/queries';
import { formatEuroCentsNl } from './seo-aggregator';

/**
 * Geographic bounding box for the European Netherlands (including Waddeneilanden & Zuid-Limburg).
 * Strictly excludes Germany, Belgium interior, and open North Sea.
 */
export const NL_LAT_MIN = 50.72;
export const NL_LAT_MAX = 53.65;
export const NL_LNG_MIN = 3.31;
export const NL_LNG_MAX = 7.25;

export const NL_MAP_MAX_BOUNDS: [[number, number], [number, number]] = [
  [3.1, 50.6], // Southwest [lng, lat]
  [7.5, 53.8], // Northeast [lng, lat]
];

export const NL_DEFAULT_CENTER: [number, number] = [5.1214, 52.15]; // Central Netherlands (Utrecht/Hilversum axis)
export const NL_DEFAULT_ZOOM = 7.4;

export function isWithinNetherlandsBounds(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= NL_LAT_MIN && lat <= NL_LAT_MAX && lng >= NL_LNG_MIN && lng <= NL_LNG_MAX;
}

export function filterValidMapVenues(venues: VenueRow[]): VenueRow[] {
  return venues.filter((v) => isWithinNetherlandsBounds(v.lat, v.lng));
}

export function formatMapMarkerLabel(venue: VenueRow): string {
  if (venue.min_single_price_cents === 0) {
    return venue.default_temp_celsius
      ? `Natuur ${venue.default_temp_celsius.toFixed(0)}°C`
      : 'Gratis';
  }
  if (typeof venue.min_single_price_cents === 'number' && venue.min_single_price_cents > 0) {
    return formatEuroCentsNl(venue.min_single_price_cents);
  }
  if (venue.venue_type === 'OPEN_WATER_NATURAL') {
    return 'Betaald';
  }
  if (venue.min_waitlist_weeks) {
    return `Les ~${venue.min_waitlist_weeks}w`;
  }
  return venue.name.slice(0, 14);
}

/**
 * Styling applied ONLY to the inner <button> inside the MapLibre marker wrapper <div>.
 * Never apply this to the outer wrapper <div> because MapLibre manages `.maplibregl-marker`
 * and `style="transform: translate(...)"` on the outer element.
 */
export function getMapMarkerButtonClasses(isSelected: boolean, isHovered: boolean): string {
  if (isSelected || isHovered) {
    return 'px-3 py-1.5 rounded-full bg-text-charcoal text-surface-pure font-extrabold text-xs shadow-xl ring-4 ring-primary-container/35 transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap';
  }
  return 'px-2.5 py-1 rounded-full bg-surface-pure text-text-charcoal font-bold text-xs shadow-md border border-border-strong hover:bg-text-charcoal hover:text-surface-pure transition-colors cursor-pointer whitespace-nowrap';
}
