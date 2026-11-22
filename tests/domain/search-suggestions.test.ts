import { describe, it, expect } from 'vitest';
import {
  normalizeSuggestionText,
  prepareSearchIndex,
  buildSearchEntriesFromVenues,
  getSearchSuggestions,
  splitHighlightSegments,
  groupSuggestionsForDisplay,
  type CompactSearchTuple,
} from '../../src/domain/search-suggestions';
import type { VenueRow } from '../../src/db/queries';

function makeVenue(overrides: Partial<VenueRow>): VenueRow {
  return {
    id: 'v-1',
    slug: 'zwembad-ijsselslag-zutphen',
    municipality_slug: 'zutphen',
    name: 'Zwembad IJsselslag',
    venue_type: 'INDOOR_AND_OUTDOOR',
    enrichment_tier: 'BASELINE',
    operational_state: 'OPEN_REGULAR',
    lat: 52.1285,
    lng: 6.2153,
    operator_name: 'Gemeente Zutphen Sportbedrijf',
    primary_water_treatment: 'TRADITIONAL_CHLORINE',
    is_nrz_licensed: 1,
    is_knzb_affiliated: 1,
    has_wheelchair_lift: 0,
    has_accessible_changing: 0,
    parking_info_nl: null,
    ev_chargers_count: 2,
    transit_chips_json: '[]',
    rating_score: 4.7,
    rating_count: 156,
    min_single_price_cents: 750,
    featured_badge_nl: null,
    neighborhood_name: 'Zutphen',
    woonplaats_name: 'Zutphen',
    woonplaats_slug: 'zutphen',
    street_address: 'Laan van Eme 101',
    postcode_pc6: '7204 LZ',
    postcode_pc4: '7204',
    municipal_keurmerk_label: null,
    municipal_pass_name: null,
    municipal_pass_discount_nl: null,
    google_maps_embed_url: null,
    google_maps_route_url: null,
    official_website_url: 'https://www.ijsselslag.nl/',
    official_tickets_url: null,
    hero_photos_json: '[]',
    zwemwater_metadata_json: null,
    lastmod_at: '2026-11-15T12:00:00Z',
    default_temp_celsius: 28,
    default_basin_name_nl: '25m Wedstrijdbad',
    min_waitlist_weeks: null,
    min_zwemles_monthly_cents: null,
    ...overrides,
  };
}

const SAMPLE_TUPLES: CompactSearchTuple[] = [
  ['m', 'Amsterdam', 'Noord-Holland · 24 locaties', '/steden/amsterdam', 'amsterdam noord-holland'],
  ['m', 'Zutphen', 'Gelderland · 2 locaties', '/steden/zutphen', 'zutphen gelderland'],
  ['w', 'Weesp', 'Gemeente Amsterdam · 1 locatie', '/steden/weesp', 'weesp amsterdam 1383'],
  ['m', 'Súdwest-Fryslân', 'Fryslân · 18 locaties', '/steden/sudwest-fryslan', 'sudwest fryslan'],
  [
    'v',
    'Zwembad IJsselslag',
    'Zutphen • Laan van Eme 101',
    '/zwembad/zutphen/zwembad-ijsselslag-zutphen',
    '7204 lz 7204lz gemeente zutphen sportbedrijf ijsselslag.nl',
  ],
  [
    'v',
    'Bronsbergenmeer',
    'Zutphen • Natuurwater',
    '/zwembad/zutphen/bronsbergenmeer',
    'zutphen natuurwater 7207',
  ],
  [
    'v',
    'Zwemcentrum De Mirandabad',
    'Amsterdam • De Mirandalaan 9',
    '/zwembad/amsterdam/de-mirandabad',
    '1079 pa 1079pa amsterdam subtropisch',
  ],
];

describe('Search Suggestions Engine (src/domain/search-suggestions.ts)', () => {
  it('returns empty array for empty or whitespace queries', () => {
    const index = prepareSearchIndex(SAMPLE_TUPLES);
    expect(getSearchSuggestions(index, '')).toEqual([]);
    expect(getSearchSuggestions(index, '   ')).toEqual([]);
  });

  it('prioritizes exact municipality match before venues in that city', () => {
    const index = prepareSearchIndex(SAMPLE_TUPLES);
    const results = getSearchSuggestions(index, 'zutphen');
    expect(results.length).toBe(3);
    expect(results[0].kind).toBe('m');
    expect(results[0].url).toBe('/steden/zutphen');
    expect(results.map((r) => r.label)).toEqual(
      expect.arrayContaining(['Zutphen', 'Zwembad IJsselslag', 'Bronsbergenmeer'])
    );
  });

  it('matches multi-word, Dutch article, postcode, and website domain queries', () => {
    const index = prepareSearchIndex(SAMPLE_TUPLES);

    expect(getSearchSuggestions(index, 'de ijsselslag')[0]?.url).toBe(
      '/zwembad/zutphen/zwembad-ijsselslag-zutphen'
    );
    expect(getSearchSuggestions(index, 'ijsselslag zutphen')[0]?.url).toBe(
      '/zwembad/zutphen/zwembad-ijsselslag-zutphen'
    );
    expect(getSearchSuggestions(index, '7204lz')[0]?.url).toBe(
      '/zwembad/zutphen/zwembad-ijsselslag-zutphen'
    );
    expect(getSearchSuggestions(index, 'ijsselslag.nl')[0]?.url).toBe(
      '/zwembad/zutphen/zwembad-ijsselslag-zutphen'
    );
  });

  it('normalizes diacritics so plain ASCII queries match Dutch accents', () => {
    const index = prepareSearchIndex(SAMPLE_TUPLES);
    expect(normalizeSuggestionText('Fryslân')).toBe('fryslan');
    const results = getSearchSuggestions(index, 'fryslan');
    expect(results.some((r) => r.url === '/steden/sudwest-fryslan')).toBe(true);
  });

  it('balances up to 8 results across places and venues without duplicate URLs', () => {
    const denseTuples: CompactSearchTuple[] = [
      ...Array.from(
        { length: 8 },
        (_, idx): CompactSearchTuple => [
          'm',
          `Badenstad ${idx + 1}`,
          `Provincie · ${idx + 2} locaties`,
          `/steden/badenstad-${idx + 1}`,
          'baden',
        ]
      ),
      ...Array.from(
        { length: 8 },
        (_, idx): CompactSearchTuple => [
          'v',
          `Zwembad Baden ${idx + 1}`,
          `Stad ${idx + 1}`,
          `/zwembad/stad-${idx + 1}/baden-${idx + 1}`,
          'baden',
        ]
      ),
    ];
    const index = prepareSearchIndex(denseTuples);
    const results = getSearchSuggestions(index, 'baden', 8);

    expect(results).toHaveLength(8);
    const placeCount = results.filter((r) => r.kind !== 'v').length;
    const venueCount = results.filter((r) => r.kind === 'v').length;
    expect(placeCount).toBeGreaterThanOrEqual(2);
    expect(venueCount).toBeGreaterThanOrEqual(3);
    expect(new Set(results.map((r) => r.url)).size).toBe(8);
  });

  it('derives municipality, distinct sub-woonplaats, and venue search entries from VenueRow[]', () => {
    const venues: VenueRow[] = [
      makeVenue({
        id: 'v-ijssel',
        slug: 'zwembad-ijsselslag-zutphen',
        municipality_slug: 'zutphen',
        name: 'Zwembad IJsselslag',
        woonplaats_name: 'Zutphen',
        woonplaats_slug: 'zutphen',
      }),
      makeVenue({
        id: 'v-abcoude',
        slug: 'het-sporthuis-abcoude',
        municipality_slug: 'de-ronde-venen',
        name: 'Het Sporthuis Abcoude',
        woonplaats_name: 'Abcoude',
        woonplaats_slug: 'abcoude',
        street_address: 'Geinplein 3',
        postcode_pc4: '1391',
        postcode_pc6: '1391 JN',
        official_website_url: 'https://hetsporthuisabcoude.nl',
      }),
    ];

    const index = buildSearchEntriesFromVenues(venues);
    expect(getSearchSuggestions(index, 'de ronde venen').some((r) => r.url === '/steden/de-ronde-venen')).toBe(true);
    expect(getSearchSuggestions(index, 'abcoude').some((r) => r.url === '/steden/abcoude')).toBe(true);
    expect(
      getSearchSuggestions(index, 'ijsselslag').some(
        (r) => r.url === '/zwembad/zutphen/zwembad-ijsselslag-zutphen'
      )
    ).toBe(true);
  });

  it('splits highlight segments cleanly while preserving original casing', () => {
    const segments = splitHighlightSegments('Zwembad IJsselslag', 'ijssel');
    expect(segments).toEqual([
      { text: 'Zwembad ', match: false },
      { text: 'IJssel', match: true },
      { text: 'slag', match: false },
    ]);

    const accented = splitHighlightSegments('Súdwest-Fryslân', 'fryslan');
    expect(accented.map((s) => s.text).join('')).toBe('Súdwest-Fryslân');
    expect(accented.some((s) => s.match && s.text === 'Fryslân')).toBe(true);
  });

  it('evaluates 2,600+ prepared entries under 20ms per query', () => {
    const bulk: CompactSearchTuple[] = [
      ...SAMPLE_TUPLES,
      ...Array.from(
        { length: 2600 },
        (_, i): CompactSearchTuple => [
          i % 3 === 0 ? 'm' : 'v',
          `Zwemlocatie Nummer ${i}`,
          `Gemeente ${i} • Straat ${i}`,
          `/zwembad/gem-${i}/loc-${i}`,
          `postcode ${1000 + (i % 8999)} nl`,
        ]
      ),
    ];
    const index = prepareSearchIndex(bulk);
    const start = performance.now();
    const results = getSearchSuggestions(index, 'ijsselslag zutphen');
    const elapsedMs = performance.now() - start;

    expect(results[0]?.url).toBe('/zwembad/zutphen/zwembad-ijsselslag-zutphen');
    expect(elapsedMs).toBeLessThan(20);
  });

  it('groups suggestions into places and venues with sequential keyboard indices', () => {
    const index = prepareSearchIndex(SAMPLE_TUPLES);
    const results = getSearchSuggestions(index, 'zutphen');
    const grouped = groupSuggestionsForDisplay(results);

    expect(grouped.map((g) => g.title)).toEqual(['Steden & Plaatsen', 'Zwembaden & Zwemwater']);
    expect(grouped.flatMap((g) => g.items.map((item) => item.index))).toEqual([0, 1, 2]);
  });
});
