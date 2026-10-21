import { describe, it, expect } from 'vitest';
import { getBuildDatabase } from '@/db/runtime-db';
import { listAllVenues, getVenueByCityAndSlug } from '@/db/queries';
import { buildVenueJsonLd } from '@/domain/seo-aggregator';

describe('Static Page & Sitemap Data Generation', () => {
  it('loads seeded venues and constructs valid canonical URLs and JSON-LD', () => {
    const db = getBuildDatabase();
    const venues = listAllVenues(db);
    expect(venues.length).toBeGreaterThanOrEqual(6);

    const miranda = getVenueByCityAndSlug(db, 'amsterdam', 'de-mirandabad');
    expect(miranda).not.toBeNull();
    const jsonLd = buildVenueJsonLd({
      name: miranda!.name,
      slug: miranda!.slug,
      citySlug: miranda!.municipality_slug,
      cityName: 'Amsterdam',
      streetAddress: miranda!.street_address,
      postcode: miranda!.postcode_pc6,
      lat: miranda!.lat,
      lng: miranda!.lng,
      ratingScore: miranda!.rating_score,
      ratingCount: miranda!.rating_count,
      minPriceCents: miranda!.min_single_price_cents,
      waterTreatment: miranda!.primary_water_treatment,
    });
    expect(jsonLd.url).toBe('https://allezwembaden.nl/zwembad/amsterdam/de-mirandabad');
    db.close();
  });
});
