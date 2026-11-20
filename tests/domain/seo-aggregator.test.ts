import { describe, it, expect } from 'vitest';
import {
  shouldGenerateIndexableFacetPage,
  getAvailableCityIntents,
  formatCitySeoDisplayName,
  buildCityHubTitleNl,
  buildCitySeoSummaryNl,
  buildVenueJsonLd,
  buildItemListJsonLd,
  buildCityIntentSeoMeta,
  buildVenuePageSeoMeta,
} from '@/domain/seo-aggregator';

describe('Programmatic SEO Quality Gate & Structured Data Builder', () => {
  it('blocks Soft-404 generation when matching venue count is 0', () => {
    expect(shouldGenerateIndexableFacetPage(0)).toBe(false);
    expect(shouldGenerateIndexableFacetPage(1)).toBe(true);
  });

  describe('getAvailableCityIntents', () => {
    it('returns empty array when there are no venues', () => {
      expect(getAvailableCityIntents([])).toEqual([]);
    });

    it('returns only buitenwater when venues are natural open water only', () => {
      const venues = [{ venue_type: 'OPEN_WATER_NATURAL' }];
      expect(getAvailableCityIntents(venues)).toEqual(['buitenwater']);
    });

    it('returns banenzwemmen and zwemles when venues are indoor pools only', () => {
      const venues = [{ venue_type: 'INDOOR_POOL' }];
      expect(getAvailableCityIntents(venues)).toEqual(['banenzwemmen', 'zwemles']);
    });

    it('returns all 3 intents when there is a mix of indoor and open water venues', () => {
      const venues = [
        { venue_type: 'INDOOR_POOL' },
        { venue_type: 'OPEN_WATER_NATURAL' },
      ];
      expect(getAvailableCityIntents(venues)).toEqual(['banenzwemmen', 'zwemles', 'buitenwater']);
    });

    it('returns all 3 intents for outdoor seasonal pool which satisfies both pool and outdoor facets', () => {
      const venues = [{ venue_type: 'OUTDOOR_SEASONAL_POOL' }];
      expect(getAvailableCityIntents(venues)).toEqual(['banenzwemmen', 'zwemles', 'buitenwater']);
    });
  });

  describe('Woonplaats SEO Display Name & Unique Meta Formatting', () => {
    it('disambiguates sub-woonplaats name with municipality parent name when different', () => {
      expect(
        formatCitySeoDisplayName('Buren', { isWoonplaats: true, municipalityName: 'Ameland' })
      ).toBe('Buren (Ameland)');
    });

    it('returns pure city name when municipality is the same as city name', () => {
      expect(
        formatCitySeoDisplayName('Buren', { isWoonplaats: true, municipalityName: 'Buren' })
      ).toBe('Buren');
      expect(
        formatCitySeoDisplayName('Buren', { isWoonplaats: false, municipalityName: 'Buren' })
      ).toBe('Buren');
    });

    it('returns plain city name when options are omitted or municipalityName is null', () => {
      expect(formatCitySeoDisplayName('Amsterdam')).toBe('Amsterdam');
      expect(formatCitySeoDisplayName('Weesp', { isWoonplaats: true, municipalityName: null })).toBe('Weesp');
    });

    it('builds unique city hub titles using disambiguated name', () => {
      expect(
        buildCityHubTitleNl('Buren', { isWoonplaats: true, municipalityName: 'Ameland' })
      ).toBe('Zwembaden in Buren (Ameland) - Prijzen, Banenzwemmen & Zwemles | Zwemkaart.nl');

      expect(
        buildCityHubTitleNl('Amsterdam', { isWoonplaats: false, municipalityName: 'Amsterdam' })
      ).toBe('Zwembaden in Amsterdam - Prijzen, Banenzwemmen & Zwemles | Zwemkaart.nl');
    });

    it('disambiguates buildCitySeoSummaryNl for sub-woonplaatsen', () => {
      const summary = buildCitySeoSummaryNl(
        {
          cityName: 'Buren',
          totalVenues: 1,
          saltWaterCount: 0,
          cheapestSinglePriceCents: 500,
          cheapestVenueName: 'Zwembad De Vlecke',
          shortestWaitlistWeeks: 2,
        },
        { isWoonplaats: true, municipalityName: 'Ameland' }
      );
      expect(summary).toContain('In Buren (Ameland) zijn er 1 zwemlocaties');
      expect(summary).toContain('Zwemdiploma A in Buren (Ameland) bedraagt momenteel circa 2 weken');
    });

    it('disambiguates buildCityIntentSeoMeta for sub-woonplaatsen in title and description while keeping h1 clean', () => {
      const intentMeta = buildCityIntentSeoMeta('Buren', 'banenzwemmen', 1, {
        isWoonplaats: true,
        municipalityName: 'Ameland',
      });
      expect(intentMeta.title).toBe('Banenzwemmen in Buren (Ameland) (1 baden & tijden) | Zwemkaart.nl');
      expect(intentMeta.h1).toBe('Banenzwemmen in Buren');
      expect(intentMeta.description).toContain('Buren (Ameland)');
      expect(intentMeta.description).toContain('1 zwembaden voor banenzwemmen in Buren (Ameland)');
    });
  });

  it('generates rich Dutch city summary facts for featured snippets', () => {
    const summary = buildCitySeoSummaryNl({
      cityName: 'Amsterdam',
      totalVenues: 4,
      saltWaterCount: 2,
      cheapestSinglePriceCents: 650,
      cheapestVenueName: 'Sportfondsenbad Amsterdam-Oost',
      shortestWaitlistWeeks: 4,
    });
    expect(summary).toContain('In Amsterdam zijn er 4 zwemlocaties');
    expect(summary).toContain('€ 6,50 bij Sportfondsenbad Amsterdam-Oost');
    expect(summary).toContain('2 zwembaden met huidvriendelijke zoutelektrolyse');
    expect(summary).toContain('4 weken');
  });

  it('builds valid Schema.org PublicSwimmingPool JSON-LD with images, sameAs, and free access flag', () => {
    const ld = buildVenueJsonLd({
      name: 'Zwemcentrum De Mirandabad',
      slug: 'de-mirandabad',
      citySlug: 'amsterdam',
      cityName: 'Amsterdam',
      streetAddress: 'De Mirandalaan 9',
      postcode: '1079 PA',
      lat: 52.3387,
      lng: 4.9021,
      ratingScore: 4.92,
      ratingCount: 312,
      minPriceCents: 820,
      waterTreatment: 'SALT_ELECTROLYSIS',
      images: ['/images/venues/official/de-mirandabad.webp'],
      description: 'Subtropisch zwembad in Amsterdam Zuid.',
      officialWebsiteUrl: 'https://www.amsterdam.nl/demirandabad/',
    });

    expect(ld['@type']).toBe('PublicSwimmingPool');
    expect(ld.url).toBe('https://zwemkaart.nl/zwembad/amsterdam/de-mirandabad');
    expect(ld.aggregateRating?.ratingValue).toBe(4.92);
    expect(ld.image).toEqual(['https://zwemkaart.nl/images/venues/official/de-mirandabad.webp']);
    expect(ld.sameAs).toBe('https://www.amsterdam.nl/demirandabad/');
    expect(ld.isAccessibleForFree).toBe(false);
  });

  it('builds Schema.org ItemList JSON-LD and rich Dutch city intent SEO metadata', () => {
    const itemList = buildItemListJsonLd({
      name: 'Zwembaden in Amsterdam',
      url: '/steden/amsterdam',
      items: [
        {
          name: 'De Mirandabad',
          url: '/zwembad/amsterdam/de-mirandabad',
          image: '/images/venues/official/de-mirandabad.webp',
        },
      ],
    });
    expect(itemList['@type']).toBe('ItemList');
    expect(itemList.url).toBe('https://zwemkaart.nl/steden/amsterdam');
    expect(itemList.numberOfItems).toBe(1);

    const intentMeta = buildCityIntentSeoMeta('Amsterdam', 'banenzwemmen', 12);
    expect(intentMeta.title).toContain('Banenzwemmen in Amsterdam');
    expect(intentMeta.h1).toBe('Banenzwemmen in Amsterdam');
    expect(intentMeta.description).toContain('12 zwembaden');
  });

  describe('buildVenuePageSeoMeta', () => {
    it('generates distinct titles and descriptions for homonym pools (De Driesprong in Zoetermeer vs Langelille)', () => {
      const zoetermeerMeta = buildVenuePageSeoMeta(
        {
          name: 'De Driesprong',
          venue_type: 'INDOOR_ONLY',
          street_address: 'Van Stolberglaan 1',
          woonplaats_name: 'Zoetermeer',
        },
        'Zoetermeer'
      );

      const langelilleMeta = buildVenuePageSeoMeta(
        {
          name: 'De Driesprong',
          venue_type: 'OPEN_WATER_NATURAL',
          street_address: 'Langelilleweg , Langelille',
          woonplaats_name: 'Langelille',
        },
        'Weststellingwerf'
      );

      expect(zoetermeerMeta.title).toBe(
        'De Driesprong (Zoetermeer) - Prijzen, Banenzwemmen & Zwemles | Zwemkaart.nl'
      );
      expect(langelilleMeta.title).toBe(
        'De Driesprong (Langelille) - Zwemwaterkwaliteit, Blauwalg & Voorzieningen | Zwemkaart.nl'
      );
      expect(zoetermeerMeta.title).not.toBe(langelilleMeta.title);

      expect(zoetermeerMeta.description).toContain('De Driesprong (Zoetermeer)');
      expect(zoetermeerMeta.description).toContain('gevestigd aan Van Stolberglaan 1');
      expect(zoetermeerMeta.description).toContain('in Zoetermeer.');

      expect(langelilleMeta.description).toContain('De Driesprong (Langelille)');
      expect(langelilleMeta.description).toContain('gevestigd aan Langelilleweg , Langelille');
      expect(langelilleMeta.description).toContain('in Langelille (Gemeente Weststellingwerf).');
      expect(zoetermeerMeta.description).not.toBe(langelilleMeta.description);
    });

    it('does not awkwardly repeat city name when venue name already contains city or municipality', () => {
      const amsterdamMeta = buildVenuePageSeoMeta(
        {
          name: 'Sloterparkbad Amsterdam',
          venue_type: 'INDOOR_AND_OUTDOOR',
          street_address: 'President Allendelaan 3',
          woonplaats_name: 'Amsterdam',
        },
        'Amsterdam'
      );

      expect(amsterdamMeta.title).toBe(
        'Sloterparkbad Amsterdam - Prijzen, Banenzwemmen & Zwemles | Zwemkaart.nl'
      );
      expect(amsterdamMeta.title).not.toContain('(Amsterdam)');

      const alkmaarMeta = buildVenuePageSeoMeta(
        {
          name: 'De Meent Alkmaar',
          venue_type: 'INDOOR_ONLY',
          street_address: 'Terborchlaan 301',
          woonplaats_name: 'Alkmaar',
        },
        'Alkmaar'
      );

      expect(alkmaarMeta.title).toBe(
        'De Meent Alkmaar - Prijzen, Banenzwemmen & Zwemles | Zwemkaart.nl'
      );
      expect(alkmaarMeta.title).not.toContain('(Alkmaar)');
    });

    it('differentiates between open-water and pool venues in meta copy', () => {
      const openWater = buildVenuePageSeoMeta(
        {
          name: 'Het Blauwe Meer',
          venue_type: 'OPEN_WATER_NATURAL',
          street_address: null,
          woonplaats_name: 'Dwingeloo',
        },
        'Westerveld'
      );

      expect(openWater.title).toContain('Zwemwaterkwaliteit, Blauwalg & Voorzieningen');
      expect(openWater.description).toContain('officiële zwemwaterkwaliteit, blauwalg-status, voorzieningen');
      expect(openWater.description).not.toContain('banenzwemmen tijden');

      const pool = buildVenuePageSeoMeta(
        {
          name: 'Sportfondsenbad',
          venue_type: 'INDOOR_ONLY',
          street_address: null,
          woonplaats_name: 'Amersfoort',
        },
        'Amersfoort'
      );

      expect(pool.title).toContain('Prijzen, Banenzwemmen & Zwemles');
      expect(pool.description).toContain('entreeprijzen, banenzwemmen tijden, watertemperatuur en Zwem-ABC wachttijden');
      expect(pool.description).not.toContain('blauwalg-status');
    });

    it('includes street_address in description when present and formats properly when absent', () => {
      const withAddress = buildVenuePageSeoMeta(
        {
          name: 'Bad Hesselingen',
          venue_type: 'INDOOR_ONLY',
          street_address: 'Badweg 1',
          woonplaats_name: 'Meppel',
        },
        'Meppel'
      );
      expect(withAddress.description).toContain(', gevestigd aan Badweg 1 in Meppel.');

      const withoutAddress = buildVenuePageSeoMeta(
        {
          name: 'Bad Hesselingen',
          venue_type: 'INDOOR_ONLY',
          street_address: null,
          woonplaats_name: 'Meppel',
        },
        'Meppel'
      );
      expect(withoutAddress.description).toContain('Bad Hesselingen (Meppel) in Meppel.');
      expect(withoutAddress.description).not.toContain('gevestigd aan');
    });
  });
});
