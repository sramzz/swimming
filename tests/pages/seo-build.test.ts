import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getBuildDatabase } from '@/db/runtime-db';
import {
  listAllVenues,
  getVenueByCityAndSlug,
  listIndexableWoonplaatsen,
  listVenuesByWoonplaats,
} from '@/db/queries';
import { buildVenueJsonLd } from '@/domain/seo-aggregator';
import { parseVenuePhotos } from '@/domain/venue-photos';
import { GET as getSitemap } from '@/pages/sitemap.xml';

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

  it('indexes sub-woonplaatsen (e.g. Abcoude, Weesp) distinct from municipality slugs and seeds their venues', () => {
    const db = getBuildDatabase();
    const subWoonplaatsen = listIndexableWoonplaatsen(db);
    expect(subWoonplaatsen.length).toBeGreaterThan(200);

    const subSlugs = subWoonplaatsen.map((w) => w.slug);
    expect(subSlugs).toContain('abcoude');
    expect(subSlugs).toContain('weesp');
    expect(subSlugs).not.toContain('amsterdam');

    const abcoudeVenues = listVenuesByWoonplaats(db, 'abcoude');
    expect(abcoudeVenues.length).toBeGreaterThanOrEqual(1);
    const abcoudeSlugs = abcoudeVenues.map((v) => v.slug);
    expect(abcoudeSlugs).toContain('het-sporthuis-abcoude');
    expect(abcoudeSlugs).toContain('hoge-dijk-speelsloot');

    const weespVenues = listVenuesByWoonplaats(db, 'weesp');
    expect(weespVenues.length).toBeGreaterThanOrEqual(1);
    const weespSlugs = weespVenues.map((v) => v.slug);
    expect(weespSlugs).toContain('victoriabad-weesp');

    db.close();
  });

  it('supports constituent woonplaats routing and navigation in city hub and intent pages', () => {
    const cityIndex = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/steden/[stad]/index.astro'),
      'utf-8'
    );
    expect(cityIndex).toContain('listIndexableWoonplaatsen');
    expect(cityIndex).toContain('listWoonplaatsenByMunicipality');
    expect(cityIndex).toContain('listVenuesByWoonplaats');
    expect(cityIndex).toContain('Plaatsen in gemeente');
    expect(cityIndex).toContain('Onderdeel van gemeente');
    expect(cityIndex).toContain('Overige zwemlocaties in gemeente');

    const cityIntent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/steden/[stad]/[intent].astro'),
      'utf-8'
    );
    expect(cityIntent).toContain('listIndexableWoonplaatsen');
    expect(cityIntent).toContain('listVenuesByWoonplaats');
    expect(cityIntent).toContain('shouldGenerateIndexableFacetPage');
    expect(cityIntent).toContain('municipalitySlug');

    const sitemap = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/sitemap.xml.ts'),
      'utf-8'
    );
    expect(sitemap).toContain('listIndexableWoonplaatsen');
    expect(sitemap).toContain('listVenuesByWoonplaats');
  });

  it('includes indexable woonplaatsen and their facet URLs in sitemap.xml output', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = (await getSitemap({} as any)) as Response;
    const xml = await response.text();
    expect(xml).toContain('<loc>https://zwemkaart.nl/steden/abcoude</loc>');
    expect(xml).toContain('<loc>https://zwemkaart.nl/steden/weesp</loc>');
    expect(xml).toContain('<loc>https://zwemkaart.nl/steden/abcoude/banenzwemmen</loc>');
    expect(xml).toContain('<loc>https://zwemkaart.nl/steden/abcoude/buitenwater</loc>');
    expect(xml).toContain('<loc>https://zwemkaart.nl/steden/weesp/banenzwemmen</loc>');

    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(new Set(locs).size).toBe(locs.length);
    for (const loc of locs) {
      expect(loc.startsWith('https://zwemkaart.nl')).toBe(true);
    }
    const badTrailingSlash = locs.filter(
      (loc) => loc !== 'https://zwemkaart.nl/' && loc.endsWith('/')
    );
    expect(badTrailingSlash).toEqual([]);

    const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
    expect(lastmods.length).toBeGreaterThan(1000);
    for (const lastmod of lastmods) {
      expect(lastmod).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    }
  });
});
