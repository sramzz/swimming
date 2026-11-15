import { describe, it, expect } from 'vitest';
import {
  rankVenuesMultiCityRecommended,
  rankVenuesByUserLocation,
  matchesVenueSearchQuery,
  FEATURED_DUTCH_CITIES,
} from '../../src/domain/multi-city-ranking';
import type { VenueRow } from '../../src/db/queries';

function makeVenue(
  slug: string,
  municipality_slug: string,
  rating_score: number,
  lat = 52.3,
  lng = 4.9,
  overrides: Partial<VenueRow> = {}
): VenueRow {
  return {
    id: `v-${slug}`,
    slug,
    municipality_slug,
    name: slug,
    venue_type: 'INDOOR_ONLY',
    enrichment_tier: municipality_slug === 'amsterdam' ? 'GOLD_STANDARD' : 'BASELINE',
    operational_state: 'OPEN_REGULAR',
    lat,
    lng,
    operator_name: 'Sportbedrijf',
    primary_water_treatment: 'SALT_ELECTROLYSIS',
    is_nrz_licensed: 1,
    is_knzb_affiliated: 1,
    has_wheelchair_lift: 1,
    has_accessible_changing: 1,
    parking_info_nl: null,
    ev_chargers_count: 2,
    transit_chips_json: '[]',
    rating_score,
    rating_count: 100,
    min_single_price_cents: 800,
    featured_badge_nl: null,
    neighborhood_name: municipality_slug,
    street_address: 'Straat 1',
    postcode_pc6: '1000 AA',
    postcode_pc4: '1000',
    municipal_keurmerk_label: null,
    municipal_pass_name: null,
    municipal_pass_discount_nl: null,
    google_maps_embed_url: null,
    google_maps_route_url: null,
    official_website_url: 'https://zwemkaart.nl',
    official_tickets_url: null,
    hero_photos_json: '[]',
    zwemwater_metadata_json: null,
    lastmod_at: '2026-11-09T20:00:00Z',
    default_temp_celsius: 28,
    default_basin_name_nl: '25m Bad',
    min_waitlist_weeks: 6,
    min_zwemles_monthly_cents: 6500,
    ...overrides,
  };
}

describe('Phase 2 (Task 7.3): Multi-City Default Homepage Ranking & Geolocation Distance Sorting', () => {
  it('interleaves municipalities so the top 10 homepage venues span at least 7 distinct cities instead of clustering Amsterdam', () => {
    const sample: VenueRow[] = [
      makeVenue('ams-1', 'amsterdam', 4.95),
      makeVenue('ams-2', 'amsterdam', 4.92),
      makeVenue('ams-3', 'amsterdam', 4.86),
      makeVenue('ams-4', 'amsterdam', 4.80),
      makeVenue('utr-1', 'utrecht', 4.90),
      makeVenue('utr-2', 'utrecht', 4.75),
      makeVenue('ehv-1', 'eindhoven', 4.88),
      makeVenue('rot-1', 'rotterdam', 4.89),
      makeVenue('dh-1', 'den-haag', 4.85),
      makeVenue('gro-1', 'groningen', 4.84),
      makeVenue('mst-1', 'maastricht', 4.83),
      makeVenue('dev-1', 'deventer', 4.82),
      makeVenue('apd-1', 'apeldoorn', 4.81),
    ];

    const ranked = rankVenuesMultiCityRecommended(sample);
    const top10Cities = new Set(ranked.slice(0, 10).map((v) => v.municipality_slug));
    expect(top10Cities.size).toBeGreaterThanOrEqual(7);
    // First 6 must not have 4 Amsterdam venues
    const amsInFirst6 = ranked.slice(0, 6).filter((v) => v.municipality_slug === 'amsterdam').length;
    expect(amsInFirst6).toBeLessThanOrEqual(1);
  });

  it('sorts venues by Haversine distance when user shares geolocation ("Dichtbij mij")', () => {
    const ams = makeVenue('ams', 'amsterdam', 4.9, 52.3676, 4.9041);
    const utr = makeVenue('utr', 'utrecht', 4.9, 52.0907, 5.1214);
    const mst = makeVenue('mst', 'maastricht', 4.9, 50.8514, 5.691);

    // User browsing from Utrecht (52.09, 5.12)
    const sorted = rankVenuesByUserLocation([ams, mst, utr], 52.09, 5.12);
    expect(sorted[0].slug).toBe('utr');
    expect(sorted[1].slug).toBe('ams');
    expect(sorted[2].slug).toBe('mst');
  });

  it('exports a curated list of major Dutch cities for the Quick City Switcher bar', () => {
    expect(FEATURED_DUTCH_CITIES.length).toBeGreaterThanOrEqual(10);
    expect(FEATURED_DUTCH_CITIES.map((c) => c.slug)).toEqual(
      expect.arrayContaining(['amsterdam', 'rotterdam', 'den-haag', 'utrecht', 'eindhoven', 'groningen', 'maastricht'])
    );
  });

  it('prioritizes venues with official on-disk photographs within municipality buckets and across municipality buckets', () => {
    // de-mirandabad has an official WebP photo; unpictured-ams does not
    // boschbad-apeldoorn has an official WebP photo; unpictured-city has higher rating but no photo
    const deMirandabad = makeVenue('de-mirandabad', 'amsterdam', 4.5, 52.34, 4.89, {
      name: 'De Mirandabad',
      enrichment_tier: 'GOLD_STANDARD',
    });
    const unpicturedAms = makeVenue('unpictured-ams', 'amsterdam', 4.95, 52.35, 4.9, {
      name: 'Unpictured Amsterdam Pool',
      enrichment_tier: 'GOLD_STANDARD',
    });
    const boschbadApeldoorn = makeVenue('boschbad-apeldoorn', 'apeldoorn', 4.6, 52.22, 5.94, {
      name: 'Boschbad Apeldoorn',
    });
    const unpicturedOtherCity = makeVenue('unpictured-other', 'coevorden', 4.99, 52.66, 6.74, {
      name: 'Coevorden Unpictured Pool',
    });

    const ranked = rankVenuesMultiCityRecommended([
      unpicturedAms,
      unpicturedOtherCity,
      deMirandabad,
      boschbadApeldoorn,
    ]);

    // Within Amsterdam bucket, official photo de-mirandabad must rank ahead of unpicturedAms despite lower rating
    const deMirandaIdx = ranked.findIndex((v) => v.slug === 'de-mirandabad');
    const unpicturedAmsIdx = ranked.findIndex((v) => v.slug === 'unpictured-ams');
    expect(deMirandaIdx).toBeLessThan(unpicturedAmsIdx);

    // Across municipality buckets, official-photo municipalities (Amsterdam, Apeldoorn) must rank ahead of non-official municipality (coevorden)
    const boschbadIdx = ranked.findIndex((v) => v.slug === 'boschbad-apeldoorn');
    const coevordenIdx = ranked.findIndex((v) => v.slug === 'unpictured-other');
    expect(boschbadIdx).toBeLessThan(coevordenIdx);
  });

  it('matches search queries across venue name, municipality, woonplaats, address, and postcode formats', () => {
    const sporthuis = makeVenue('het-sporthuis-abcoude', 'de-ronde-venen', 4.8, 52.27, 4.97, {
      name: 'Het Sporthuis Abcoude',
      woonplaats_name: 'Abcoude',
      woonplaats_slug: 'abcoude',
      street_address: 'Geinplein 3',
      postcode_pc4: '1391',
      postcode_pc6: '1391 JN',
      neighborhood_name: 'Abcoude-Noord',
    });
    const weespPool = makeVenue('sportcentrum-weesp', 'amsterdam', 4.5, 52.3, 5.04, {
      name: 'Sportcentrum Weesp',
      woonplaats_name: 'Weesp',
      woonplaats_slug: 'weesp',
      street_address: 'Papelaan 12',
      postcode_pc4: '1383',
      postcode_pc6: '1383 AB',
      neighborhood_name: 'Aetsveld',
    });

    // Query on woonplaats name & slug
    expect(matchesVenueSearchQuery(sporthuis, 'Abcoude')).toBe(true);
    expect(matchesVenueSearchQuery(sporthuis, 'abcoude')).toBe(true);
    expect(matchesVenueSearchQuery(weespPool, 'weesp')).toBe(true);

    // Query on street address
    expect(matchesVenueSearchQuery(sporthuis, 'Geinplein 3')).toBe(true);
    expect(matchesVenueSearchQuery(sporthuis, 'geinplein')).toBe(true);

    // Query on postcode: with space, without space, 4-digit
    expect(matchesVenueSearchQuery(sporthuis, '1391 JN')).toBe(true);
    expect(matchesVenueSearchQuery(sporthuis, '1391jn')).toBe(true);
    expect(matchesVenueSearchQuery(sporthuis, '1391JN')).toBe(true);
    expect(matchesVenueSearchQuery(weespPool, '1383')).toBe(true);

    // Query on venue name
    expect(matchesVenueSearchQuery(sporthuis, 'Het Sporthuis')).toBe(true);
    expect(matchesVenueSearchQuery(sporthuis, 'sporthuis')).toBe(true);

    // Empty or whitespace query
    expect(matchesVenueSearchQuery(sporthuis, '')).toBe(true);
    expect(matchesVenueSearchQuery(sporthuis, '   ')).toBe(true);

    // Non-matching query
    expect(matchesVenueSearchQuery(sporthuis, 'Maastricht')).toBe(false);
  });
});
