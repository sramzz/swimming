import { describe, it, expect } from 'vitest';
import {
  shouldGenerateIndexableFacetPage,
  buildCitySeoSummaryNl,
  buildVenueJsonLd,
  buildItemListJsonLd,
  buildCityIntentSeoMeta,
} from '@/domain/seo-aggregator';

describe('Programmatic SEO Quality Gate & Structured Data Builder', () => {
  it('blocks Soft-404 generation when matching venue count is 0', () => {
    expect(shouldGenerateIndexableFacetPage(0)).toBe(false);
    expect(shouldGenerateIndexableFacetPage(1)).toBe(true);
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
});
