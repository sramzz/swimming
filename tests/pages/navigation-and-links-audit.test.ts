import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

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
});
