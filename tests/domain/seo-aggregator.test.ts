import { describe, it, expect } from 'vitest';
import {
  shouldGenerateIndexableFacetPage,
  buildCitySeoSummaryNl,
  buildVenueJsonLd,
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

  it('builds valid Schema.org SportsActivityLocation JSON-LD', () => {
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
    });

    expect(ld['@type']).toBe('PublicSwimmingPool');
    expect(ld.url).toBe('https://zwemkaart.nl/zwembad/amsterdam/de-mirandabad');
    expect(ld.aggregateRating?.ratingValue).toBe(4.92);
  });
});
