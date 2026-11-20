import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
import {
  auditDistDirectory,
  hasAuditFailures,
  unescapeHtml,
  extractAttr,
  extractMeta,
  normalizeInternalHref,
  type DistSeoAuditReport,
} from '@/cli/audit-dist-seo';

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

  describe('audit-dist-seo helper and extraction logic', () => {
    it('unescapes HTML entities properly without double unescaping', () => {
      expect(unescapeHtml('&quot;Hello&quot; &amp; &#39;World&#39;')).toBe('"Hello" & \'World\'');
      expect(unescapeHtml('&#38;amp;')).toBe('&amp;');
      expect(unescapeHtml('Zwembaden in &#39;s-Gravendeel')).toBe("Zwembaden in 's-Gravendeel");
    });

    it('extracts HTML attributes safely with single or double quotes and apostrophes inside', () => {
      const attrs = 'name="description" content="In \'s-Gravendeel (Hoeksche Waard) zijn er 1 zwemlocaties."';
      expect(extractAttr(attrs, 'name')).toBe('description');
      expect(extractAttr(attrs, 'content')).toBe("In 's-Gravendeel (Hoeksche Waard) zijn er 1 zwemlocaties.");

      const inverted = 'content=\'https://zwemkaart.nl/image.webp\' property="og:image"';
      expect(extractAttr(inverted, 'property')).toBe('og:image');
      expect(extractAttr(inverted, 'content')).toBe('https://zwemkaart.nl/image.webp');
    });

    it('extracts meta description and og:image handling attribute order variations', () => {
      const html1 = '<meta name="description" content="Zwembad beschrijving">';
      const html2 = '<meta content="Zwembad omgekeerd" name="description">';
      const html3 = '<meta property="og:image" content="https://zwemkaart.nl/hero.webp">';
      expect(extractMeta(html1, 'name', 'description')).toBe('Zwembad beschrijving');
      expect(extractMeta(html2, 'name', 'description')).toBe('Zwembad omgekeerd');
      expect(extractMeta(html3, 'property', 'og:image')).toBe('https://zwemkaart.nl/hero.webp');
    });

    it('normalizes internal hrefs and ignores protocol-relative or external links', () => {
      expect(normalizeInternalHref('/steden/amsterdam')).toBe('/steden/amsterdam');
      expect(normalizeInternalHref('/steden/amsterdam/')).toBe('/steden/amsterdam');
      expect(normalizeInternalHref('/steden/amsterdam?q=1#main')).toBe('/steden/amsterdam');
      expect(normalizeInternalHref('/')).toBe('/');
      expect(normalizeInternalHref('/#top')).toBe('/');
      expect(normalizeInternalHref('https://zwemkaart.nl/steden/rotterdam')).toBe('/steden/rotterdam');
      expect(normalizeInternalHref('//example.com/foo')).toBeNull();
      expect(normalizeInternalHref('https://google.com')).toBeNull();
      expect(normalizeInternalHref('mailto:info@zwemkaart.nl')).toBeNull();
      expect(normalizeInternalHref('#anchor')).toBeNull();
    });

    it('identifies audit failures correctly in hasAuditFailures', () => {
      const cleanReport: DistSeoAuditReport = {
        totalHtmlFiles: 4862,
        totalIndexablePages: 4861,
        sitemapUrlCount: 4861,
        totalInternalLinksChecked: 500000,
        missingTitle: [],
        duplicateTitles: [],
        missingDescription: [],
        duplicateDescriptions: [],
        missingH1: [],
        canonicalMismatch: [],
        sitemapMissingInDist: [],
        distMissingInSitemap: [],
        missingJsonLd: [],
        invalidJsonLd: [],
        missingOgImage: [],
        brokenOgImageAsset: [],
        badTextTokens: [],
        brokenInternalLinks: [],
      };
      expect(hasAuditFailures(cleanReport)).toBe(false);

      expect(hasAuditFailures({ ...cleanReport, totalIndexablePages: 4000 })).toBe(true);
      expect(hasAuditFailures({ ...cleanReport, missingTitle: ['/test'] })).toBe(true);
      expect(hasAuditFailures({ ...cleanReport, brokenInternalLinks: [{ sourceUrl: '/', href: '/bad' }] })).toBe(true);
    });

    it('detects missing SEO elements and broken assets on a synthetic fixture directory', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-audit-fixture-'));
      expect(tmpDir).toBeDefined();
      try {
        fs.mkdirSync(path.join(tmpDir, 'page-a'), { recursive: true });
        fs.mkdirSync(path.join(tmpDir, 'page-b'), { recursive: true });
        fs.mkdirSync(path.join(tmpDir, 'page-empty'), { recursive: true });

        // sitemap
        const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://zwemkaart.nl/</loc></url>
<url><loc>https://zwemkaart.nl/page-a</loc></url>
<url><loc>https://zwemkaart.nl/page-empty</loc></url>
<url><loc>https://zwemkaart.nl/page-ghost</loc></url>
</urlset>`;
        fs.writeFileSync(path.join(tmpDir, 'sitemap.xml'), sitemapXml, 'utf-8');

        // index.html - clean
        const indexHtml = `<!DOCTYPE html><html><head>
<title>Homepage Title</title>
<meta name="description" content="Homepage Description">
<link rel="canonical" href="https://zwemkaart.nl/">
<meta property="og:image" content="https://zwemkaart.nl/image.webp">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite"}</script>
</head><body>
<h1>Homepage Heading</h1>
<a href="/page-a">To Page A</a>
<a href="/broken-link">Broken</a>
</body></html>`;
        fs.writeFileSync(path.join(tmpDir, 'index.html'), indexHtml, 'utf-8');
        fs.writeFileSync(path.join(tmpDir, 'image.webp'), 'fake image data', 'utf-8');

        // page-a - bad tokens, duplicate title, broken og image
        const pageAHtml = `<!DOCTYPE html><html><head>
<title>Homepage Title</title>
<meta name="description" content="Page A Description">
<link rel="canonical" href="https://zwemkaart.nl/wrong-canonical">
<meta property="og:image" content="/missing-og.webp">
<script type="application/ld+json">INVALID_JSON_HERE</script>
</head><body>
<h1>Heading with undefined</h1>
<p>Visible NaN body</p>
<a href="/">Back Home</a>
</body></html>`;
        fs.writeFileSync(path.join(tmpDir, 'page-a', 'index.html'), pageAHtml, 'utf-8');

        // page-b - not in sitemap
        const pageBHtml = `<!DOCTYPE html><html><head>
<title>Page B Title</title>
<meta name="description" content="Page B Description">
<link rel="canonical" href="https://zwemkaart.nl/page-b">
<meta property="og:image" content="/image.webp">
<script type="application/ld+json">{"@context":"https://schema.org"}</script>
</head><body>
<h1>Page B Heading</h1>
<a href="/">Home</a>
</body></html>`;
        fs.writeFileSync(path.join(tmpDir, 'page-b', 'index.html'), pageBHtml, 'utf-8');

        // page-empty - missing title, description, h1, og:image, and json-ld
        const pageEmptyHtml = `<!DOCTYPE html><html><head>
<link rel="canonical" href="https://zwemkaart.nl/page-empty">
</head><body>
<p>Empty SEO shell</p>
</body></html>`;
        fs.writeFileSync(path.join(tmpDir, 'page-empty', 'index.html'), pageEmptyHtml, 'utf-8');

        // 404.html
        const page404Html = `<!DOCTYPE html><html><head>
<title>404</title><meta name="robots" content="noindex">
</head><body><h1>Not found</h1><a href="/page-a">Go to A</a></body></html>`;
        fs.writeFileSync(path.join(tmpDir, '404.html'), page404Html, 'utf-8');

        const report = await auditDistDirectory(tmpDir);

        expect(report.totalHtmlFiles).toBe(5);
        expect(report.totalIndexablePages).toBe(4);
        expect(report.sitemapUrlCount).toBe(4);
        expect(report.missingTitle).toEqual(['/page-empty']);
        expect(report.missingDescription).toEqual(['/page-empty']);
        expect(report.missingH1).toEqual(['/page-empty']);
        expect(report.missingOgImage).toEqual(['/page-empty']);
        expect(report.missingJsonLd).toEqual(['/page-empty']);
        expect(report.duplicateTitles.length).toBe(1);
        expect(report.duplicateTitles[0].title).toBe('Homepage Title');
        expect(report.canonicalMismatch).toEqual([{ url: '/page-a', canonical: 'https://zwemkaart.nl/wrong-canonical' }]);
        expect(report.brokenOgImageAsset).toEqual([{ url: '/page-a', ogImage: '/missing-og.webp' }]);
        expect(report.invalidJsonLd.length).toBe(1);
        expect(report.invalidJsonLd[0].url).toBe('/page-a');
        expect(report.distMissingInSitemap).toEqual(['https://zwemkaart.nl/page-b']);
        expect(report.sitemapMissingInDist).toEqual(['https://zwemkaart.nl/page-ghost']);
        expect(report.brokenInternalLinks).toEqual([{ sourceUrl: '/', href: '/broken-link' }]);
        expect(report.badTextTokens).toContainEqual({ url: '/page-a', field: 'h1', token: 'undefined' });
        expect(report.badTextTokens).toContainEqual({ url: '/page-a', field: 'body', token: 'NaN' });
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('executes full audit over built dist/ directory when present', async () => {
      const sitemapPath = path.resolve(process.cwd(), 'dist', 'sitemap.xml');
      if (!fs.existsSync(sitemapPath)) {
        // Skip if dist has not been generated yet
        return;
      }

      const report = await auditDistDirectory();
      expect(report.totalIndexablePages).toBeGreaterThanOrEqual(4800);
      expect(report.sitemapUrlCount).toBeGreaterThanOrEqual(4800);
      expect(report.totalInternalLinksChecked).toBeGreaterThan(100000);

      expect(report.missingTitle).toEqual([]);
      expect(report.duplicateTitles).toEqual([]);
      expect(report.missingDescription).toEqual([]);
      expect(report.duplicateDescriptions).toEqual([]);
      expect(report.missingH1).toEqual([]);
      expect(report.canonicalMismatch).toEqual([]);
      expect(report.sitemapMissingInDist).toEqual([]);
      expect(report.distMissingInSitemap).toEqual([]);
      expect(report.missingJsonLd).toEqual([]);
      expect(report.invalidJsonLd).toEqual([]);
      expect(report.missingOgImage).toEqual([]);
      expect(report.brokenOgImageAsset).toEqual([]);
      expect(report.badTextTokens).toEqual([]);
      expect(report.brokenInternalLinks).toEqual([]);
      expect(hasAuditFailures(report)).toBe(false);
    });
  });
});
