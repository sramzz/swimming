import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getBuildDatabase } from '@/db/runtime-db';
import { getVenueByCityAndSlug, getMunicipalityBySlug } from '@/db/queries';
import { buildVenueJsonLd } from '@/domain/seo-aggregator';

describe('Phase 2 (Tasks 7.4–7.6): Full Navigation, Header Controls, B2B Portal & Booking Widget Audit', () => {
  it('provides /aanbieder (src/pages/aanbieder.astro) and /steden (src/pages/steden/index.astro) pages', () => {
    const aanbiederPath = path.resolve(process.cwd(), 'src/pages/aanbieder.astro');
    const stedenIndexPath = path.resolve(process.cwd(), 'src/pages/steden/index.astro');

    expect(fs.existsSync(aanbiederPath)).toBe(true);
    expect(fs.existsSync(stedenIndexPath)).toBe(true);

    const aanbiederHtml = fs.readFileSync(aanbiederPath, 'utf-8');
    expect(aanbiederHtml).toContain('canonicalPath="/aanbieder"');
    expect(aanbiederHtml).toContain('/api/leads');

    const stedenHtml = fs.readFileSync(stedenIndexPath, 'utf-8');
    expect(stedenHtml).toContain('canonicalPath="/steden"');
    expect(stedenHtml).toContain('/provincies/');
  });

  it('wires Header.astro without dead /#aanbieder or /#favorieten links and includes Globe & Favorites dialogs', () => {
    const headerAstro = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/Header.astro'),
      'utf-8'
    );

    expect(headerAstro).not.toContain('href="/#aanbieder"');
    expect(headerAstro).not.toContain('href="/#favorieten"');
    expect(headerAstro).toContain('href="/aanbieder"');
    expect(headerAstro).toContain('id="header-globe-btn"');
    expect(headerAstro).toContain('id="header-globe-dialog"');
    expect(headerAstro).toContain('id="header-user-menu-btn"');
    expect(headerAstro).toContain('id="header-favorites-dialog"');
  });

  it('links Footer.astro to major cities, provinces, /steden, /aanbieder, and /sitemap.xml', () => {
    const footerAstro = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/Footer.astro'),
      'utf-8'
    );

    expect(footerAstro).toContain('/steden/rotterdam');
    expect(footerAstro).toContain('/steden/den-haag');
    expect(footerAstro).toContain('/provincies/noord-holland');
    expect(footerAstro).toContain('/provincies/zuid-holland');
    expect(footerAstro).toContain('/steden');
    expect(footerAstro).toContain('/aanbieder');
  });

  it('wires StickyBookingWidgetIsland with officialWebsiteUrl fallback and dedicated Open-Water Zwemwater.nl mode', () => {
    const detailAstro = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/zwembad/[stad]/[slug].astro'),
      'utf-8'
    );
    const widgetTsx = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/islands/StickyBookingWidgetIsland.tsx'),
      'utf-8'
    );

    expect(detailAstro).toContain('officialWebsiteUrl={venue.official_website_url}');
    expect(detailAstro).toContain('isOpenWater={isOpenWater}');
    expect(widgetTsx).toContain('props.officialTicketsUrl || props.officialWebsiteUrl');
    expect(widgetTsx).toContain('props.isOpenWater');
  });

  it('wires SearchAndFilterIsland with Multi-City ranking, Dichtbij mij geolocation, and loaded venues map sync', () => {
    const searchTsx = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/islands/SearchAndFilterIsland.tsx'),
      'utf-8'
    );

    expect(searchTsx).toContain('rankVenuesMultiCityRecommended');
    expect(searchTsx).toContain('rankVenuesByUserLocation');
    expect(searchTsx).toContain('Dichtbij mij');
    expect(searchTsx).toContain('venues: displayed');
  });

  describe('Milestone 8 (Task 8.8): Municipality & Woonplaats Dynamic Breadcrumbs, Vacation Regions and /steden Index Audit', () => {
    it('wires [stad]/[slug].astro with dynamic getMunicipalityBySlug, vacation regions, and woonplaats breadcrumbs', () => {
      const detailSource = fs.readFileSync(
        path.resolve(process.cwd(), 'src/pages/zwembad/[stad]/[slug].astro'),
        'utf-8'
      );

      // Verifies getMunicipalityBySlug import and call before db.close()
      expect(detailSource).toContain('getMunicipalityBySlug');
      expect(detailSource).not.toContain("venue.municipality_slug === 'eindhoven' ? 'zuid'");
      expect(detailSource).not.toContain("venue.municipality_slug === 'utrecht' ? 'midden'");

      // Verifies vacationRegion uses municipality?.school_vacation_region
      expect(detailSource).toMatch(/municipality\??\.school_vacation_region \?\? 'noord'/);

      // Verifies municipalityName derivation and usage in breadcrumb and link
      expect(detailSource).toContain('municipalityName');
      expect(detailSource).toContain('hasDistinctWoonplaats');

      // Verifies cityName in buildVenueJsonLd uses venue.woonplaats_name || municipalityName
      expect(detailSource).toMatch(/cityName:\s*venue\.woonplaats_name\s*\|\|\s*municipalityName/);

      // Verifies breadcrumbJsonLd and nav include distinct woonplaats when present
      expect(detailSource).toContain('venue.woonplaats_slug');
      expect(detailSource).toContain('venue.woonplaats_name');

      // Verifies clean address display in #locatie section with (Gemeente ...)
      expect(detailSource).toContain('Gemeente');
    });

    it('renders constituent woonplaatsen and search attributes on /steden (src/pages/steden/index.astro)', () => {
      const stedenSource = fs.readFileSync(
        path.resolve(process.cwd(), 'src/pages/steden/index.astro'),
        'utf-8'
      );

      // Verifies constituent woonplaatsen query with w.slug != w.municipality_slug
      expect(stedenSource).toContain('w.slug != w.municipality_slug');
      expect(stedenSource).toContain('woonplaatsen');

      // Verifies constituent names included in search attributes
      expect(stedenSource).toMatch(/data-city-name=.*\{.*(wp|constituent)/i);

      // Verifies dedicated constituent woonplaatsen section
      expect(stedenSource).toMatch(/Alle Plaatsen (&amp;|&) Dorpen \(Woonplaatsen\)/);

      // Verifies constituent woonplaats links to /steden/
      expect(stedenSource).toMatch(/\/steden\/\$\{.*slug\}/);
    });

    it('verifies dynamic breadcrumbs, vacation regions and JSON-LD for distinct woonplaats venues (e.g. Abcoude in De Ronde Venen)', () => {
      const db = getBuildDatabase();
      const venue = getVenueByCityAndSlug(db, 'de-ronde-venen', 'het-sporthuis-abcoude');
      expect(venue).not.toBeNull();
      expect(venue!.woonplaats_slug).toBe('abcoude');
      expect(venue!.woonplaats_name).toBe('Abcoude');
      expect(venue!.municipality_slug).toBe('de-ronde-venen');

      const municipality = getMunicipalityBySlug(db, venue!.municipality_slug);
      expect(municipality).not.toBeNull();
      expect(municipality!.name).toBe('De Ronde Venen');
      expect(municipality!.school_vacation_region).toBe('midden');

      const municipalityName = municipality?.name ?? venue!.municipality_slug;
      const hasDistinctWoonplaats = Boolean(
        venue!.woonplaats_slug && venue!.woonplaats_name && venue!.woonplaats_slug !== venue!.municipality_slug
      );
      expect(hasDistinctWoonplaats).toBe(true);

      const cityName = venue!.woonplaats_name || municipalityName;
      expect(cityName).toBe('Abcoude');

      const jsonLd = buildVenueJsonLd({
        name: venue!.name,
        slug: venue!.slug,
        citySlug: venue!.municipality_slug,
        cityName,
        streetAddress: venue!.street_address,
        postcode: venue!.postcode_pc6,
        lat: venue!.lat,
        lng: venue!.lng,
        ratingScore: venue!.rating_score,
        ratingCount: venue!.rating_count,
        minPriceCents: venue!.min_single_price_cents,
        waterTreatment: venue!.primary_water_treatment,
      });

      expect(jsonLd.address.addressLocality).toBe('Abcoude');

      const breadcrumbItems = [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Nederland',
          item: 'https://zwemkaart.nl/',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: municipalityName,
          item: `https://zwemkaart.nl/steden/${venue!.municipality_slug}`,
        },
      ];

      if (hasDistinctWoonplaats) {
        breadcrumbItems.push({
          '@type': 'ListItem',
          position: 3,
          name: venue!.woonplaats_name!,
          item: `https://zwemkaart.nl/steden/${venue!.woonplaats_slug}`,
        });
      }

      breadcrumbItems.push({
        '@type': 'ListItem',
        position: breadcrumbItems.length + 1,
        name: venue!.name,
        item: `https://zwemkaart.nl/zwembad/${venue!.municipality_slug}/${venue!.slug}`,
      });

      expect(breadcrumbItems).toHaveLength(4);
      expect(breadcrumbItems[1].name).toBe('De Ronde Venen');
      expect(breadcrumbItems[1].item).toBe('https://zwemkaart.nl/steden/de-ronde-venen');
      expect(breadcrumbItems[2].name).toBe('Abcoude');
      expect(breadcrumbItems[2].item).toBe('https://zwemkaart.nl/steden/abcoude');
      expect(breadcrumbItems[3].name).toBe('Het Sporthuis Abcoude');
      expect(breadcrumbItems[3].item).toBe('https://zwemkaart.nl/zwembad/de-ronde-venen/het-sporthuis-abcoude');

      db.close();
    });

    it('verifies constituent woonplaats query and grouping on /steden includes Abcoude and Weesp', () => {
      const db = getBuildDatabase();
      const constituentWoonplaatsen = db
        .prepare(
          `SELECT w.slug, w.name, w.municipality_slug, COUNT(v.id) as venue_count
           FROM woonplaatsen w
           JOIN venues v ON v.woonplaats_id = w.id
           WHERE w.slug != w.municipality_slug
           GROUP BY w.id
           ORDER BY venue_count DESC, w.name ASC`
        )
        .all() as Array<{ slug: string; name: string; municipality_slug: string; venue_count: number }>;

      const abcoude = constituentWoonplaatsen.find((w) => w.slug === 'abcoude');
      expect(abcoude).toBeDefined();
      expect(abcoude!.municipality_slug).toBe('de-ronde-venen');
      expect(abcoude!.venue_count).toBeGreaterThanOrEqual(1);

      const weesp = constituentWoonplaatsen.find((w) => w.slug === 'weesp');
      expect(weesp).toBeDefined();
      expect(weesp!.municipality_slug).toBe('amsterdam');
      expect(weesp!.venue_count).toBeGreaterThanOrEqual(1);

      db.close();
    });

    it('wires accessible combobox search suggestions and performance guards in Header.astro and SearchAndFilterIsland.tsx', () => {
      const headerSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/Header.astro'),
        'utf-8'
      );
      const searchTsx = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/islands/SearchAndFilterIsland.tsx'),
        'utf-8'
      );

      expect(headerSrc).toContain('/data/search-index.json');
      expect(headerSrc).toContain('role="combobox"');
      expect(headerSrc).toContain('role="listbox"');
      expect(headerSrc).toContain('aria-activedescendant');
      expect(headerSrc).toContain('enterkeyhint="search"');
      expect(headerSrc).toContain('e.isComposing');
      expect(headerSrc).toContain('contain: layout style paint');

      expect(searchTsx).toContain('buildSearchEntriesFromVenues');
      expect(searchTsx).toContain('role="combobox"');
      expect(searchTsx).toContain('role="listbox"');
      expect(searchTsx).toContain('aria-activedescendant');
      expect(searchTsx).toContain('enterkeyhint="search"');
      expect(searchTsx).toContain('isComposing');
      expect(searchTsx).toContain("contain: 'layout style paint'");
    });
  });
});
