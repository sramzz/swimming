import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getBuildDatabase } from '@/db/runtime-db';
import { listAllVenues, getVenueByCityAndSlug } from '@/db/queries';
import { buildVenueJsonLd } from '@/domain/seo-aggregator';
import { parseVenuePhotos } from '@/domain/venue-photos';

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

  it('provides the 12 Dutch Province Hub route (/provincies/[provincie].astro)', () => {
    const provincePage = path.resolve(process.cwd(), 'src/pages/provincies/[provincie].astro');
    expect(fs.existsSync(provincePage)).toBe(true);
    const content = fs.readFileSync(provincePage, 'utf-8');
    expect(content).toContain('getStaticPaths');
    expect(content).toContain('BreadcrumbList');
    expect(content).toContain('Gemeenten in');
  });

  it('populates self-hosted local WebP 5-photo galleries for all venues and renders Airbnb UI components', () => {
    const db = getBuildDatabase();
    const venues = listAllVenues(db);
    for (const v of venues.slice(0, 30)) {
      const photos = parseVenuePhotos(v);
      expect(photos.length).toBeGreaterThanOrEqual(5);
      for (const p of photos) {
        expect(p.url.startsWith('/images/venues/')).toBe(true);
        expect(p.url.endsWith('.webp')).toBe(true);
      }
    }
    db.close();

    const headerAstro = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/Header.astro'),
      'utf-8'
    );
    expect(headerAstro).toContain('Waar');
    expect(headerAstro).toContain('Wat zoek je?');
    expect(headerAstro).toContain('Wie?');
    expect(headerAstro).toContain('Word Aanbieder');

    const mapIsland = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/islands/ListingMapIsland.tsx'),
      'utf-8'
    );
    expect(mapIsland).toContain('https://tiles.openfreemap.org/styles/liberty');
  });

  it('provides native horizontal scroll-snap photo carousels on mobile across SearchAndFilterIsland, VenueCard, and Detail page', () => {
    const searchIsland = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/islands/SearchAndFilterIsland.tsx'),
      'utf-8'
    );
    const venueCard = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/VenueCard.astro'),
      'utf-8'
    );
    const detailPage = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/zwembad/[stad]/[slug].astro'),
      'utf-8'
    );
    const globalCss = fs.readFileSync(
      path.resolve(process.cwd(), 'src/styles/global.css'),
      'utf-8'
    );

    expect(globalCss).toContain('scroll-snap-type: x mandatory');
    expect(globalCss).toContain('.carousel-scroll-slide');
    expect(searchIsland).toContain('carousel-scroll-track');
    expect(searchIsland).toContain('carousel-scroll-slide');
    expect(venueCard).toContain('carousel-scroll-track');
    expect(venueCard).toContain('carousel-scroll-slide');
    expect(detailPage).toContain('id="detail-mobile-carousel-track"');
    expect(detailPage).toContain('carousel-scroll-slide');
  });

  it('hardens BaseLayout, sitemap.xml, and index.astro for Google crawlers and Google Images', () => {
    const baseLayout = fs.readFileSync(
      path.resolve(process.cwd(), 'src/layouts/BaseLayout.astro'),
      'utf-8'
    );
    const sitemap = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/sitemap.xml.ts'),
      'utf-8'
    );
    const indexAstro = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/index.astro'),
      'utf-8'
    );

    expect(baseLayout).toContain('max-image-preview:large');
    expect(baseLayout).toContain('hreflang="nl-NL"');
    expect(baseLayout).toContain('property="og:image"');
    expect(baseLayout).toContain('name="twitter:card"');
    expect(sitemap).toContain('/steden');
    expect(sitemap).toContain('/aanbieder');
    expect(sitemap).toContain("'banenzwemmen', 'zwemles', 'buitenwater'");
    expect(indexAstro).toContain('buildItemListJsonLd');
    expect(indexAstro).toContain('/provincies/');
  });

  it('configures Cloudflare Worker Build Output v0 with runWorkerFirst, ASSETS binding, drop-trailing-slash, and 404.astro', () => {
    const prepareCf = fs.readFileSync(
      path.resolve(process.cwd(), 'src/cli/prepare-cf-output.ts'),
      'utf-8'
    );
    expect(prepareCf).toContain("htmlHandling: 'drop-trailing-slash'");
    expect(prepareCf).toContain('runWorkerFirst: true');
    expect(prepareCf).toContain("type: 'assets'");

    const page404 = path.resolve(process.cwd(), 'src/pages/404.astro');
    expect(fs.existsSync(page404)).toBe(true);
    const content404 = fs.readFileSync(page404, 'utf-8');
    expect(content404).toContain('robots="noindex, follow"');
  });
});
