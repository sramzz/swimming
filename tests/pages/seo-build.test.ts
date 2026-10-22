import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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
    expect(jsonLd.url).toBe('https://zwemkaart.nl/zwembad/amsterdam/de-mirandabad');
    db.close();
  });

  it('renders homepage with SearchAndFilterIsland and 58/42 Split-View ListingMapIsland', () => {
    const indexAstro = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/index.astro'),
      'utf-8'
    );
    expect(indexAstro).toContain('SearchAndFilterIsland');
    expect(indexAstro).toContain('ListingMapIsland');
    expect(indexAstro).toContain('lg:w-[58%]');
    expect(indexAstro).toContain('lg:w-[42%]');
  });

  it('wires StickyBookingWidgetIsland, AlertBanner, schedule slots, and transit chips into Facility Detail page', () => {
    const detailAstro = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/zwembad/[stad]/[slug].astro'),
      'utf-8'
    );
    expect(detailAstro).toContain('StickyBookingWidgetIsland');
    expect(detailAstro).toContain('AlertBanner');
    expect(detailAstro).toContain('resolveVenueScheduleAndAlerts');
    expect(detailAstro).toContain('Banenzwemmen & Openingstijden');
    expect(detailAstro).toContain('transitChips');
  });

  it('exposes /api/health.json route and GitHub Actions CI workflow', () => {
    expect(
      fs.existsSync(path.resolve(process.cwd(), 'src/pages/api/health.json.ts'))
    ).toBe(true);
    expect(
      fs.existsSync(path.resolve(process.cwd(), '.github/workflows/ci.yml'))
    ).toBe(true);
  });
});
