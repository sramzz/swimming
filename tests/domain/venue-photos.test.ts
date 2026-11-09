import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildCuratedPhotosForVenue, parseVenuePhotos } from '@/domain/venue-photos';
import { rankVenuesMultiCityRecommended } from '@/domain/multi-city-ranking';
import { getBuildDatabase } from '@/db/runtime-db';
import { listAllVenues } from '@/db/queries';

describe('Airbnb Aquatic Discovery UI & Self-Hosted Photo Library', () => {
  it('verifies every referenced WebP image physically exists on disk in public/images/venues/', () => {
    const db = getBuildDatabase();
    const venues = listAllVenues(db);
    db.close();

    expect(venues.length).toBeGreaterThanOrEqual(500);
    const checkedUrls = new Set<string>();

    for (const v of venues) {
      const photos = parseVenuePhotos(v);
      expect(photos.length).toBe(5);
      for (const photo of photos) {
        expect(photo.url.startsWith('/images/venues/')).toBe(true);
        expect(photo.url.endsWith('.webp')).toBe(true);
        expect(photo.alt_nl.length).toBeGreaterThan(5);
        checkedUrls.add(photo.url);
      }
    }

    for (const url of checkedUrls) {
      const diskPath = path.resolve(process.cwd(), 'public', url.replace(/^\//, ''));
      expect(fs.existsSync(diskPath)).toBe(true);
      const stat = fs.statSync(diskPath);
      expect(stat.size).toBeGreaterThan(5000);
    }
  });

  it('rotates photos deterministically across slugs so adjacent pools do not repeat the same cover image', () => {
    const openWaterA = buildCuratedPhotosForVenue({
      slug: 'zegerplas-speelvijver',
      name: 'Zegerplas Speelvijver',
      venueType: 'OPEN_WATER_NATURAL',
    });
    const openWaterB = buildCuratedPhotosForVenue({
      slug: 'kralingse-plas',
      name: 'Kralingse Plas',
      venueType: 'OPEN_WATER_NATURAL',
    });
    expect(openWaterA.length).toBe(5);
    expect(openWaterB.length).toBe(5);
    // All 5 photos within a single venue's 5-photo hero grid must be distinct
    const uniqueUrlsA = new Set(openWaterA.map((p) => p.url));
    expect(uniqueUrlsA.size).toBe(5);
  });

  it('guarantees 100% unique primary cover photos across the top 24 multi-city homepage cards (zero repetition)', () => {
    const db = getBuildDatabase();
    const venues = listAllVenues(db);
    db.close();

    const top24 = rankVenuesMultiCityRecommended(venues).slice(0, 24);
    expect(top24.length).toBe(24);
    const primaryPhotoUrls = top24.map((v) => parseVenuePhotos(v)[0]!.url);
    const uniquePrimaryUrls = new Set(primaryPhotoUrls);
    expect(uniquePrimaryUrls.size).toBe(24);
  });

  it('verifies Homepage, Detail Page, City/Province filters, and MapLibre colorful style invariants', () => {
    const indexAstro = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/index.astro'), 'utf-8');
    // Sticky 7-category bar
    expect(indexAstro).toContain('Alle Baden');
    expect(indexAstro).toContain('Zwemles A/B/C');
    expect(indexAstro).toContain('Banenzwemmen');
    expect(indexAstro).toContain('Subtropisch');
    expect(indexAstro).toContain('Buiten &amp; Wetsuit');
    expect(indexAstro).toContain('Herfst Seizoen');
    expect(indexAstro).toContain('Binnenbaden');
    expect(indexAstro).toContain('Wellness');
    // Official accreditation banner
    expect(indexAstro).toContain('Officieel Erkend Platform');
    expect(indexAstro).toContain('Zwemwater.nl Live Kwaliteit: 98% Schoon');

    // SearchAndFilterIsland sorting & seasonal banner
    const searchIsland = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/islands/SearchAndFilterIsland.tsx'),
      'utf-8'
    );
    expect(searchIsland).toContain('Aanbevolen');
    expect(searchIsland).toContain('Hoogste waardering ★');
    expect(searchIsland).toContain('Kortste wachttijd les');
    expect(searchIsland).toContain('Watertemperatuur (Warmste)');
    expect(searchIsland).toContain('Zoutelektrolyse (Zoutwater)');
    expect(searchIsland).toContain('Buitenzwemmen stopt niet in de herfst');

    // Detail page 5-photo grid, timeline, and kept LazyGoogleMapIframe
    const detailAstro = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/zwembad/[stad]/[slug].astro'),
      'utf-8'
    );
    expect(detailAstro).toContain("Toon alle 28 foto's");
    expect(detailAstro).toContain('photo-lightbox-modal');
    expect(detailAstro).toContain('Fase 1: Watergewenning');
    expect(detailAstro).toContain('Fase 4: Diploma C Complete Zwemveiligheid');
    expect(detailAstro).toContain('LazyGoogleMapIframe');

    // City & Province filter pills without split-screen map
    const cityAstro = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/steden/[stad]/index.astro'),
      'utf-8'
    );
    expect(cityAstro).toContain('static-filter-pill');
    expect(cityAstro).not.toContain('ListingMapIsland');

    const provAstro = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/provincies/[provincie].astro'),
      'utf-8'
    );
    expect(provAstro).toContain('prov-filter-pill');
    expect(provAstro).not.toContain('ListingMapIsland');
  });
});
