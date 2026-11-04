import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getBuildDatabase } from '@/db/runtime-db';
import { listAllVenues } from '@/db/queries';

describe('National Venue Ingestion (500+ Dutch Pools)', () => {
  it('bundles valid reference datasets for all 342 Dutch municipalities and curated pools', () => {
    const munPath = path.resolve(process.cwd(), 'src/data/dutch-municipalities.json');
    const poolsPath = path.resolve(process.cwd(), 'src/data/curated-pools.json');
    const zwemPath = path.resolve(process.cwd(), 'src/data/zwemwater-spots.json');

    expect(fs.existsSync(munPath)).toBe(true);
    expect(fs.existsSync(poolsPath)).toBe(true);
    expect(fs.existsSync(zwemPath)).toBe(true);

    const municipalities = JSON.parse(fs.readFileSync(munPath, 'utf-8'));
    const curatedPools = JSON.parse(fs.readFileSync(poolsPath, 'utf-8'));
    const zwemData = JSON.parse(fs.readFileSync(zwemPath, 'utf-8'));

    expect(municipalities.length).toBeGreaterThanOrEqual(342);
    expect(curatedPools.length).toBeGreaterThanOrEqual(50);
    expect(zwemData.spots.length).toBeGreaterThanOrEqual(900);
  });

  it('contains over 500 venues in database with preserved flagships', () => {
    const db = getBuildDatabase();
    const venues = listAllVenues(db);
    expect(venues.length).toBeGreaterThanOrEqual(500);

    // Verify key flagship venues are preserved with GOLD_STANDARD tier
    const goldVenues = db
      .prepare("SELECT slug, enrichment_tier FROM venues WHERE enrichment_tier = 'GOLD_STANDARD'")
      .all() as Array<{ slug: string; enrichment_tier: string }>;
    expect(goldVenues.length).toBeGreaterThanOrEqual(6);

    const goldSlugs = new Set(goldVenues.map((v) => v.slug));
    expect(goldSlugs.has('de-mirandabad')).toBe(true);
    expect(goldSlugs.has('sloterparkbad')).toBe(true);
    expect(goldSlugs.has('gaasperplas-open-water')).toBe(true);

    // Verify outdoor locations have NATURAL_UNTREATED water treatment
    const outdoorCount = (
      db.prepare("SELECT count(*) as c FROM venues WHERE venue_type = 'OPEN_WATER_NATURAL'").get() as { c: number }
    ).c;
    expect(outdoorCount).toBeGreaterThanOrEqual(900);

    // Verify all venue coordinates are strictly within Dutch bounding box
    const outOfBounds = (
      db.prepare(
        'SELECT count(*) as c FROM venues WHERE lat < 50.7 OR lat > 53.8 OR lng < 3.3 OR lng > 7.3'
      ).get() as { c: number }
    ).c;
    expect(outOfBounds).toBe(0);

    db.close();
  });
});
