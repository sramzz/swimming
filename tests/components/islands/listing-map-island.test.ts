import { describe, it, expect } from 'vitest';
import {
  isWithinNetherlandsBounds,
  filterValidMapVenues,
  formatMapMarkerLabel,
  getMapMarkerButtonClasses,
  NL_MAP_MAX_BOUNDS,
} from '../../../src/domain/map-bounds';
import type { VenueRow } from '../../../src/db/queries';

function makeVenue(overrides: Partial<VenueRow>): VenueRow {
  return {
    id: 'v-1',
    slug: 'de-mirandabad',
    municipality_slug: 'amsterdam',
    name: 'Zwemcentrum De Mirandabad',
    venue_type: 'SUBTROPICAL_PARADISE',
    enrichment_tier: 'GOLD_STANDARD',
    operational_state: 'OPEN_REGULAR',
    lat: 52.3385,
    lng: 4.9021,
    operator_name: 'Gemeente Amsterdam',
    primary_water_treatment: 'SALT_ELECTROLYSIS',
    is_nrz_licensed: 1,
    is_knzb_affiliated: 1,
    has_wheelchair_lift: 1,
    has_accessible_changing: 1,
    parking_info_nl: null,
    ev_chargers_count: 4,
    transit_chips_json: '[]',
    rating_score: 4.92,
    rating_count: 312,
    min_single_price_cents: 820,
    featured_badge_nl: 'Populairste Keuze',
    neighborhood_name: 'Amsterdam Zuid',
    street_address: 'De Mirandalaan 9',
    postcode_pc6: '1079 PA',
    postcode_pc4: '1079',
    municipal_keurmerk_label: 'Gemeente Amsterdam Keurmerk',
    municipal_pass_name: 'Stadspas',
    municipal_pass_discount_nl: '€ 1,50',
    google_maps_embed_url: 'https://maps.google.com',
    google_maps_route_url: 'https://maps.google.com',
    official_website_url: 'https://www.amsterdam.nl/demirandabad/',
    official_tickets_url: 'https://www.amsterdam.nl/demirandabad/',
    hero_photos_json: '[]',
    zwemwater_metadata_json: null,
    lastmod_at: '2026-11-09T20:00:00Z',
    default_temp_celsius: 31.0,
    default_basin_name_nl: 'Subtropisch Golfslagbad',
    min_waitlist_weeks: 6,
    min_zwemles_monthly_cents: 6450,
    ...overrides,
  };
}

describe('Phase 1: MapLibre NL Bounds, Marker Wrapper Isolation & Loaded Venues Sync', () => {
  it('accepts valid Netherlands coordinates and rejects coordinates in Germany or outside NL', () => {
    // Amsterdam
    expect(isWithinNetherlandsBounds(52.3385, 4.9021)).toBe(true);
    // Maastricht (Southern Limburg)
    expect(isWithinNetherlandsBounds(50.8514, 5.691)).toBe(true);
    // Groningen (North)
    expect(isWithinNetherlandsBounds(53.2194, 6.5665)).toBe(true);

    // Berlin, Germany -> MUST BE REJECTED
    expect(isWithinNetherlandsBounds(52.52, 13.405)).toBe(false);
    // Hamburg, Germany -> MUST BE REJECTED
    expect(isWithinNetherlandsBounds(53.5511, 9.9937)).toBe(false);
    // Dresden, Germany -> MUST BE REJECTED
    expect(isWithinNetherlandsBounds(51.0504, 13.7373)).toBe(false);
    // Null / NaN -> MUST BE REJECTED
    expect(isWithinNetherlandsBounds(NaN, 4.9)).toBe(false);
  });

  it('filters out any out-of-bounds venues before rendering map markers', () => {
    const valid = makeVenue({ id: 'v-nl', lat: 52.3385, lng: 4.9021 });
    const german = makeVenue({ id: 'v-de', lat: 52.52, lng: 13.405 });
    const result = filterValidMapVenues([valid, german]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('v-nl');
  });

  it('defines strict Netherlands maxBounds so camera cannot drift across Europe', () => {
    const [[west, south], [east, north]] = NL_MAP_MAX_BOUNDS;
    expect(west).toBeGreaterThanOrEqual(3.0);
    expect(east).toBeLessThanOrEqual(7.6);
    expect(south).toBeGreaterThanOrEqual(50.5);
    expect(north).toBeLessThanOrEqual(53.9);
  });

  it('formats marker labels accurately for paid pools, free open water, and paid open water', () => {
    expect(formatMapMarkerLabel(makeVenue({ min_single_price_cents: 820 }))).toBe('€ 8,20');
    expect(
      formatMapMarkerLabel(
        makeVenue({
          venue_type: 'OPEN_WATER_NATURAL',
          min_single_price_cents: 0,
          default_temp_celsius: null,
        })
      )
    ).toBe('Gratis');
    expect(
      formatMapMarkerLabel(
        makeVenue({
          venue_type: 'OPEN_WATER_NATURAL',
          min_single_price_cents: null,
          default_temp_celsius: null,
        })
      )
    ).toBe('Betaald');
  });

  it('never applies CSS scale/transform transitions on the MapLibre outer marker wrapper', () => {
    const activeClasses = getMapMarkerButtonClasses(true, false);
    const hoveredClasses = getMapMarkerButtonClasses(false, true);
    const idleClasses = getMapMarkerButtonClasses(false, false);

    expect(activeClasses).toContain('bg-text-charcoal');
    expect(hoveredClasses).toContain('bg-text-charcoal');
    expect(idleClasses).toContain('bg-surface-pure');
    // Must not use transition-all which fights MapLibre transform if applied to root
    expect(idleClasses).not.toContain('transition-all');
  });
});
