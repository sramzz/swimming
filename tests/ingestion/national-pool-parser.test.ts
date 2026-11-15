import { describe, expect, it } from 'vitest';
import {
  parseZwemindexProvinceHtml,
  classifyPoolVenueType,
  inferWaterTreatmentFromText,
  deriveBasinsFromFacilityTags,
  deriveDefaultOfferingsAndTariffs,
  DutchCoordinateSchema,
  cleanOfficialWebsiteUrl,
} from '../../src/ingestion/national-pool-parser';

// Realistic HTML snippet simulating Zwemindex.nl province listing (Noord-Holland)
const SAMPLE_PROVINCE_HTML = `
<!DOCTYPE html>
<html lang="nl">
<head><title>Zwembaden in Noord-Holland - Zwemindex.nl</title></head>
<body>
<div id="pools">
  <!-- Card 1: Abcoude indoor pool with zoutelektrolyse -->
  <article class="card-pool content" id="16">
    <span class="spanchor" id="het-sporthuis-abcoude-abcoude"></span>
    <h3><a href="https://hetsporthuisabcoude.nl/zwemmen/?utm_source=zwemindex.nl">Het Sporthuis Abcoude</a></h3>
    <p class="tags">
      <a class="tag is-link is-light" href="/abcoude/zwembaden">Abcoude</a>
      <span class="tag">Binnenbad</span>
    </p>
    <p class="description">Duurzaam binnenzwembad met zoutelektrolyse desinfectie, zacht voor huid en ogen.</p>
    <div class="tags facilities">
      <span class="zi_tag">25m bad</span>
      <span class="zi_tag">Doelgroepenbad</span>
      <span class="zi_tag">Whirlpool</span>
    </div>
    <button class="button is-small" onclick="showLocationOnMap(16)">
      <span class="icon">📍</span>
      <span>Geinplein 3</span>
    </button>
  </article>

  <!-- Card 2: Weesp indoor pool -->
  <article class="card-pool content" id="42">
    <span class="spanchor" id="zwembad-weesp-weesp"></span>
    <h3><a href="https://zwembadweesp.nl/?utm_source=zwemindex.nl&amp;ref=index">Zwembad Weesp</a></h3>
    <p class="tags">
      <a class="tag is-link is-light" href="/weesp/zwembaden">Weesp</a>
      <span class="tag">Binnenbad</span>
    </p>
    <p class="description">Gezellig gemeentelijk zwembad met instructiebad en UV-desinfectie.</p>
    <div class="tags facilities">
      <span class="zi_tag">25m bad</span>
      <span class="zi_tag">Instructiebad</span>
    </div>
    <button class="button is-small" onclick="showLocationOnMap(42)">
      <span class="icon">📍</span>
      <span>Papelaan 124</span>
    </button>
  </article>

  <!-- Card 3: Tikibad Subtropical Waterpark -->
  <article class="card-pool content" id="88">
    <span class="spanchor" id="tikibad-duinrell-wassenaar"></span>
    <h3><a href="https://duinrell.nl/tikibad?utm_source=zwemindex.nl#tickets">Tikibad Duinrell</a></h3>
    <p class="tags">
      <a class="tag is-link is-light" href="/wassenaar/zwembaden">Wassenaar</a>
      <span class="tag">Subtropisch waterpark</span>
    </p>
    <p class="description">Grootste overdekte waterpark van de Benelux met golfslagbad en verwarmd buitenbad.</p>
    <div class="tags facilities">
      <span class="zi_tag">Golfslagbad</span>
      <span class="zi_tag">Wildwaterbaan</span>
      <span class="zi_tag">Buitenbad</span>
      <span class="zi_tag">Peuterbad</span>
    </div>
    <button class="button is-small" onclick="showLocationOnMap(88)">
      <span class="icon">📍</span>
      <span>Duinrell 1</span>
    </button>
  </article>

  <!-- Card 4: Haarlem Outdoor seasonal pool -->
  <article class="card-pool content" id="101">
    <span class="spanchor" id="openluchtzwembad-de-houtvaart-haarlem"></span>
    <h3><a href="https://houtvaart.nl/">Openluchtzwembad De Houtvaart</a></h3>
    <p class="tags">
      <a class="tag is-link is-light" href="/haarlem/zwembaden">Haarlem</a>
      <span class="tag">Openluchtbad</span>
    </p>
    <p class="description">Monumentaal 50-meter openluchtbad geopend van mei tot september.</p>
    <div class="tags facilities">
      <span class="zi_tag">50m bad</span>
      <span class="zi_tag">Peuterbad</span>
      <span class="zi_tag">Ligweide</span>
    </div>
    <button class="button is-small" onclick="showLocationOnMap(101)">
      <span class="icon">📍</span>
      <span>Piet van Wijngaerdtlaan 1</span>
    </button>
  </article>

  <!-- Card 5: Missing mapData coordinates -->
  <article class="card-pool content" id="999">
    <span class="spanchor" id="onbekend-bad-amsterdam"></span>
    <h3><a href="https://example.com/bad">Onbekend Bad</a></h3>
    <p class="tags">
      <a class="tag is-link is-light" href="/amsterdam/zwembaden">Amsterdam</a>
      <span class="tag">Binnenbad</span>
    </p>
    <div class="tags facilities">
      <span class="zi_tag">25m bad</span>
    </div>
    <button class="button is-small" onclick="showLocationOnMap(999)">
      <span>Keizersgracht 1</span>
    </button>
  </article>

  <!-- Card 6: Out-of-bounds coordinates (Spain) -->
  <article class="card-pool content" id="777">
    <span class="spanchor" id="bad-buitenland"></span>
    <h3><a href="https://example.com/spanje">Zwembad Costa</a></h3>
    <p class="tags">
      <a class="tag is-link is-light" href="/buitenland/zwembaden">Buitenland</a>
    </p>
    <button class="button is-small" onclick="showLocationOnMap(777)">
      <span>Calle Mayor 1</span>
    </button>
  </article>
</div>

<script>
let mapData = [
  {"data":{"id":16,"icon":"pool-indoor","name":"Het Sporthuis Abcoude"},"geo":[4.9715,52.2731]},
  {"data":{"id":42,"icon":"pool-indoor","name":"Zwembad Weesp"},"geo":[5.0412,52.3084]},
  {"data":{"id":88,"icon":"pool-waterpark","name":"Tikibad Duinrell"},"geo":[4.3821,52.1465]},
  {"data":{"id":101,"icon":"pool-outdoor","name":"Openluchtzwembad De Houtvaart"},"geo":[4.6183,52.3789]},
  {"data":{"id":777,"icon":"pool-outdoor","name":"Zwembad Costa"},"geo":[2.1734,41.3851]}
];
</script>
</body>
</html>
`;

describe('national-pool-parser', () => {
  describe('DutchCoordinateSchema', () => {
    it('validates coordinates strictly within Dutch bounding box (50.7..53.8, 3.3..7.3)', () => {
      // Valid Amsterdam coordinate
      const valid = DutchCoordinateSchema.safeParse({ lat: 52.3676, lng: 4.9041 });
      expect(valid.success).toBe(true);

      // South of NL (Belgium border)
      const southBorder = DutchCoordinateSchema.safeParse({ lat: 50.75, lng: 5.7 });
      expect(southBorder.success).toBe(true);

      // North of NL (Wadden islands)
      const northBorder = DutchCoordinateSchema.safeParse({ lat: 53.5, lng: 6.2 });
      expect(northBorder.success).toBe(true);

      // Outside bounds: Spain lat 41.38
      const invalidLat = DutchCoordinateSchema.safeParse({ lat: 41.3851, lng: 2.1734 });
      expect(invalidLat.success).toBe(false);

      // Outside bounds: UK lng 0.12
      const invalidLng = DutchCoordinateSchema.safeParse({ lat: 51.5, lng: 0.12 });
      expect(invalidLng.success).toBe(false);
    });
  });

  describe('cleanOfficialWebsiteUrl', () => {
    it('strips utm_source query parameter while preserving path and other parameters', () => {
      expect(cleanOfficialWebsiteUrl('https://hetsporthuisabcoude.nl/zwemmen/?utm_source=zwemindex.nl')).toBe(
        'https://hetsporthuisabcoude.nl/zwemmen/'
      );
      expect(
        cleanOfficialWebsiteUrl('https://duinrell.nl/tikibad?utm_source=zwemindex.nl&tab=tarieven#tickets')
      ).toBe('https://duinrell.nl/tikibad?tab=tarieven#tickets');
      expect(cleanOfficialWebsiteUrl('https://houtvaart.nl/')).toBe('https://houtvaart.nl/');
      expect(cleanOfficialWebsiteUrl(null)).toBeNull();
      expect(cleanOfficialWebsiteUrl(undefined)).toBeNull();
    });
  });

  describe('parseZwemindexProvinceHtml', () => {
    it('extracts all cards matched with mapData coordinates, strips utm_source, and flags invalid bounds', () => {
      const results = parseZwemindexProvinceHtml(SAMPLE_PROVINCE_HTML, 'noord-holland');
      expect(results).toHaveLength(6);

      // Card 1: Het Sporthuis Abcoude
      const abcoude = results.find((r) => r.externalId === '16');
      expect(abcoude).toBeDefined();
      expect(abcoude?.name).toBe('Het Sporthuis Abcoude');
      expect(abcoude?.sourceSlug).toBe('het-sporthuis-abcoude-abcoude');
      expect(abcoude?.officialWebsiteUrl).toBe('https://hetsporthuisabcoude.nl/zwemmen/');
      expect(abcoude?.woonplaatsName).toBe('Abcoude');
      expect(abcoude?.streetAddress).toBe('Geinplein 3');
      expect(abcoude?.rawTypeLabel).toBe('Binnenbad');
      expect(abcoude?.mapIcon).toBe('pool-indoor');
      expect(abcoude?.facilityTags).toEqual(['25m bad', 'Doelgroepenbad', 'Whirlpool']);
      expect(abcoude?.descriptionNl).toContain('zoutelektrolyse desinfectie');
      expect(abcoude?.lat).toBeCloseTo(52.2731, 4);
      expect(abcoude?.lng).toBeCloseTo(4.9715, 4);
      expect(abcoude?.isValidCoordinate).toBe(true);
      expect(abcoude?.provinceSlug).toBe('noord-holland');

      // Card 3: Tikibad Duinrell (Waterpark)
      const tikibad = results.find((r) => r.externalId === '88');
      expect(tikibad).toBeDefined();
      expect(tikibad?.name).toBe('Tikibad Duinrell');
      expect(tikibad?.officialWebsiteUrl).toBe('https://duinrell.nl/tikibad#tickets');
      expect(tikibad?.mapIcon).toBe('pool-waterpark');
      expect(tikibad?.facilityTags).toContain('Golfslagbad');
      expect(tikibad?.facilityTags).toContain('Wildwaterbaan');
      expect(tikibad?.lat).toBeCloseTo(52.1465, 4);
      expect(tikibad?.lng).toBeCloseTo(4.3821, 4);
      expect(tikibad?.isValidCoordinate).toBe(true);

      // Card 4: Openluchtzwembad De Houtvaart
      const houtvaart = results.find((r) => r.externalId === '101');
      expect(houtvaart).toBeDefined();
      expect(houtvaart?.name).toBe('Openluchtzwembad De Houtvaart');
      expect(houtvaart?.mapIcon).toBe('pool-outdoor');
      expect(houtvaart?.rawTypeLabel).toBe('Openluchtbad');
      expect(houtvaart?.facilityTags).toContain('50m bad');
      expect(houtvaart?.isValidCoordinate).toBe(true);

      // Card 5: Missing mapData coordinates
      const missingCoord = results.find((r) => r.externalId === '999');
      expect(missingCoord).toBeDefined();
      expect(missingCoord?.lat).toBeNull();
      expect(missingCoord?.lng).toBeNull();
      expect(missingCoord?.mapIcon).toBeNull();
      expect(missingCoord?.isValidCoordinate).toBe(false);

      // Card 6: Spain coordinates (out of bounds)
      const spain = results.find((r) => r.externalId === '777');
      expect(spain).toBeDefined();
      expect(spain?.lat).toBeCloseTo(41.3851, 4);
      expect(spain?.lng).toBeCloseTo(2.1734, 4);
      expect(spain?.isValidCoordinate).toBe(false);
    });

    it('handles empty or malformed HTML gracefully without throwing', () => {
      const empty = parseZwemindexProvinceHtml('<html><body></body></html>', 'utrecht');
      expect(empty).toEqual([]);

      const malformed = parseZwemindexProvinceHtml('<div>invalid html', 'utrecht');
      expect(malformed).toEqual([]);
    });
  });

  describe('classifyPoolVenueType', () => {
    it('returns exact SQLite-valid venue_type values satisfying CHECK constraints', () => {
      // Subtropical paradise via icon
      expect(classifyPoolVenueType('Recreatiebad', 'pool-waterpark', ['Golfslagbad'])).toBe(
        'SUBTROPICAL_PARADISE'
      );
      // Subtropical paradise via label / tags
      expect(classifyPoolVenueType('Subtropisch zwembad', 'pool-indoor', ['Wildwaterbaan'])).toBe(
        'SUBTROPICAL_PARADISE'
      );

      // Combi pool via mapIcon
      expect(classifyPoolVenueType('Combi-zwembad', 'pool-combi', ['25m bad', 'Buitenbad'])).toBe(
        'INDOOR_AND_OUTDOOR'
      );
      // Combi pool via indoor + outdoor facilities
      expect(classifyPoolVenueType('Binnenbad', 'pool-indoor', ['25m bad', 'Buitenbassin'])).toBe(
        'INDOOR_AND_OUTDOOR'
      );

      // Outdoor seasonal pool via icon or label
      expect(classifyPoolVenueType('Openluchtbad', 'pool-outdoor', ['50m bad', 'Ligweide'])).toBe(
        'OUTDOOR_SEASONAL_POOL'
      );
      expect(classifyPoolVenueType('Buitenbad', 'pool-outdoor-star', ['Peuterbad'])).toBe(
        'OUTDOOR_SEASONAL_POOL'
      );

      // Boutique swim school only
      expect(
        classifyPoolVenueType('Binnenbad', 'pool-indoor', ['Instructiebad'], '', true)
      ).toBe('BOUTIQUE_SWIM_SCHOOL_POOL');
      expect(
        classifyPoolVenueType('Particuliere Zwemschool', 'pool-indoor', ['Instructiebad'])
      ).toBe('BOUTIQUE_SWIM_SCHOOL_POOL');

      // Indoor only
      expect(classifyPoolVenueType('Binnenbad', 'pool-indoor', ['25m bad', 'Whirlpool'])).toBe(
        'INDOOR_ONLY'
      );

      // Open water
      expect(classifyPoolVenueType('Natuurwater', undefined, ['Strandbad'])).toBe(
        'OPEN_WATER_NATURAL'
      );
    });
  });

  describe('inferWaterTreatmentFromText', () => {
    it('returns SALT_ELECTROLYSIS when zout / zoutelektrolyse / zoutwater is mentioned', () => {
      expect(
        inferWaterTreatmentFromText(['25m bad'], 'Duurzaam zwemmen met zoutelektrolyse.')
      ).toBe('SALT_ELECTROLYSIS');
      expect(
        inferWaterTreatmentFromText(['Zoutwaterbad', '25m bad'], 'Moderne waterzuivering.')
      ).toBe('SALT_ELECTROLYSIS');
      expect(
        inferWaterTreatmentFromText([], 'Gezuiverd met zout elektrolyse voor zacht water.')
      ).toBe('SALT_ELECTROLYSIS');
    });

    it('returns UV_LOW_CHLORINE when UV / chloorarm / ozon is mentioned', () => {
      expect(
        inferWaterTreatmentFromText(['25m bad'], 'Desinfectie middels UV-C licht en chloorarm water.')
      ).toBe('UV_LOW_CHLORINE');
      expect(
        inferWaterTreatmentFromText(['Ozonbehandeling'], 'Kwalitatief zwemwater.')
      ).toBe('UV_LOW_CHLORINE');
    });

    it('defaults to TRADITIONAL_CHLORINE when no specific low-chlorine method is found', () => {
      expect(
        inferWaterTreatmentFromText(['25m bad', 'Whirlpool'], 'Regulier gemeentelijk zwembad.')
      ).toBe('TRADITIONAL_CHLORINE');
      expect(inferWaterTreatmentFromText([], null)).toBe('TRADITIONAL_CHLORINE');
    });
  });

  describe('deriveBasinsFromFacilityTags', () => {
    it('generates 1..N basin objects with strictly valid basin_category and exactly 1 primary default basin', () => {
      const basins = deriveBasinsFromFacilityTags(
        'INDOOR_ONLY',
        ['25m bad', 'Doelgroepenbad', 'Peuterbad'],
        'SALT_ELECTROLYSIS',
        'Modern sportcomplex'
      );

      expect(basins.length).toBe(3);

      // Verify category CHECK constraints
      const validCategories = [
        'COMPETITION_50M',
        'COMPETITION_25M',
        'INSTRUCTION_TARGET_GROUP',
        'SUBTROPICAL_WAVE_RECREATION',
        'TODDLER_POOL',
        'OUTDOOR_HEATED_BASIN',
        'OUTDOOR_UNHEATED_BASIN',
        'NATURAL_OPEN_WATER',
      ];
      for (const b of basins) {
        expect(validCategories).toContain(b.basin_category);
        expect(b.water_treatment).toBe('SALT_ELECTROLYSIS');
        expect([0, 1]).toContain(b.is_indoor);
        expect([0, 1]).toContain(b.is_default_basin);
      }

      // Exactly ONE default basin
      const defaultBasins = basins.filter((b) => b.is_default_basin === 1);
      expect(defaultBasins).toHaveLength(1);
      expect(defaultBasins[0].basin_category).toBe('COMPETITION_25M');
      expect(defaultBasins[0].length_meters).toBe(25);
      expect(defaultBasins[0].lanes_count).toBe(6);

      // Verify Doelgroepenbad properties
      const doelgroep = basins.find((b) => b.basin_category === 'INSTRUCTION_TARGET_GROUP');
      expect(doelgroep).toBeDefined();
      expect(doelgroep?.has_movable_floor).toBe(1);
      expect(doelgroep?.target_temp_celsius).toBe(31.5);

      // Verify Peuterbad properties
      const peuter = basins.find((b) => b.basin_category === 'TODDLER_POOL');
      expect(peuter).toBeDefined();
      expect(peuter?.target_temp_celsius).toBe(32.5);
    });

    it('generates 50m competition pool and outdoor basins for seasonal openluchtbad', () => {
      const basins = deriveBasinsFromFacilityTags(
        'OUTDOOR_SEASONAL_POOL',
        ['50m bad', 'Peuterbad', 'Ligweide'],
        'TRADITIONAL_CHLORINE',
        'Openluchtbad'
      );

      expect(basins.length).toBe(2);
      const defaultBasin = basins.find((b) => b.is_default_basin === 1);
      expect(defaultBasin?.basin_category).toBe('COMPETITION_50M');
      expect(defaultBasin?.length_meters).toBe(50);
      expect(defaultBasin?.lanes_count).toBe(8);
      expect(defaultBasin?.is_indoor).toBe(0);
    });

    it('provides sensible fallback when facility tags are empty', () => {
      const basins = deriveBasinsFromFacilityTags(
        'SUBTROPICAL_PARADISE',
        [],
        'TRADITIONAL_CHLORINE',
        'Zwemparadijs'
      );

      expect(basins.length).toBe(1);
      expect(basins[0].basin_category).toBe('SUBTROPICAL_WAVE_RECREATION');
      expect(basins[0].is_default_basin).toBe(1);
      expect(basins[0].target_temp_celsius).toBe(30.5);
    });
  });

  describe('deriveDefaultOfferingsAndTariffs', () => {
    it('generates valid tariffs, slots, and offerings satisfying all SQLite CHECK constraints', () => {
      const result = deriveDefaultOfferingsAndTariffs({
        venueType: 'INDOOR_ONLY',
        venueSlug: 'de-mirandabad',
        minSinglePriceCents: 850,
        operatorName: 'Gemeente Amsterdam Sportbedrijf',
      });

      // Tariffs check
      expect(result.tariffs.length).toBeGreaterThanOrEqual(3);
      const adultTariff = result.tariffs.find((t) => t.tariff_category === 'SINGLE_ADULT');
      expect(adultTariff).toBeDefined();
      // Passes sanity-gate price window (150 <= price <= 3500) and milestone constraint (450 <= price <= 2400)
      expect(adultTariff!.price_cents).toBeGreaterThanOrEqual(450);
      expect(adultTariff!.price_cents).toBeLessThanOrEqual(2400);

      const childTariff = result.tariffs.find((t) => t.tariff_category === 'SINGLE_CHILD');
      expect(childTariff).toBeDefined();
      expect(childTariff!.price_cents).toBeLessThan(adultTariff!.price_cents);

      const pass10 = result.tariffs.find((t) => t.tariff_category === 'MULTI_PASS_10');
      expect(pass10).toBeDefined();
      expect(pass10!.visits_included).toBe(10);

      const validTariffCategories = [
        'SINGLE_ADULT',
        'SINGLE_CHILD',
        'MULTI_PASS_10',
        'MULTI_PASS_12',
        'MONTHLY_UNLIMITED_LANES',
        'ZWEMLES_MONTHLY_PACKAGE',
        'ZWEMLES_ALL_IN_GUARANTEE',
        'EQUIPMENT_RENTAL',
      ];
      for (const t of result.tariffs) {
        expect(validTariffCategories).toContain(t.tariff_category);
      }

      // Schedule slots check
      expect(result.slots.length).toBeGreaterThanOrEqual(4);
      const validActivityTypes = [
        'BANENZWEMMEN',
        'VRIJZWEMMEN_RECREATIEF',
        'ZWEMLES_ABC',
        'DOELGROEPEN_AQUASPORT',
        'OUDER_EN_KIND',
        'WARMWATERZWEMMEN',
        'LADIES_ONLY',
        'NATUURWATER_TOEGANG',
      ];
      for (const s of result.slots) {
        expect(validActivityTypes).toContain(s.activity_type);
        expect(s.day_of_week).toBeGreaterThanOrEqual(1);
        expect(s.day_of_week).toBeLessThanOrEqual(7);
        expect(s.start_time).toMatch(/^\d{2}:\d{2}$/);
        expect(s.end_time).toMatch(/^\d{2}:\d{2}$/);
      }

      // Swim offerings check
      expect(result.offerings.length).toBeGreaterThanOrEqual(3);
      const validDiplomaTracks = [
        'WATERGEWENNING',
        'DIPLOMA_A',
        'DIPLOMA_B',
        'DIPLOMA_C',
        'ABC_COMPLETE_PACKAGE',
        'TURBO_SNELCURSUS',
        'PRIVATE_OR_LOW_STIMULUS',
      ];
      const tracks = result.offerings.map((o) => o.diploma_track);
      expect(tracks).toContain('DIPLOMA_A');
      expect(tracks).toContain('DIPLOMA_B');
      expect(tracks).toContain('DIPLOMA_C');
      for (const o of result.offerings) {
        expect(validDiplomaTracks).toContain(o.diploma_track);
        expect(o.monthly_price_cents).toBeGreaterThan(0);
        expect([0, 1]).toContain(o.has_diploma_guarantee);
        expect(o.lesson_duration_mins).toBe(45);
      }
    });

    it('returns empty offerings for open water natural locations', () => {
      const result = deriveDefaultOfferingsAndTariffs({
        venueType: 'OPEN_WATER_NATURAL',
        venueSlug: 'gaasperplas',
        minSinglePriceCents: 0,
      });

      expect(result.offerings).toEqual([]);
    });
  });
});
