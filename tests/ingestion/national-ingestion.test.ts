import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getBuildDatabase } from '@/db/runtime-db';
import { listAllVenues, findVenuesNearPostcodePc4 } from '@/db/queries';
import { runNationalIngestion } from '@/cli/ingest-national';

describe('National Venue Ingestion (500+ Dutch Pools)', () => {
  it('bundles valid reference datasets for all 342 Dutch municipalities and curated pools', () => {
    const munPath = path.resolve(process.cwd(), 'src/data/dutch-municipalities.json');
    const poolsPath = path.resolve(process.cwd(), 'src/data/curated-pools.json');
    const zwemPath = path.resolve(process.cwd(), 'src/data/zwemwater-spots.json');
    const woonplaatsenPath = path.resolve(process.cwd(), 'src/data/dutch-woonplaatsen.json');

    expect(fs.existsSync(munPath)).toBe(true);
    expect(fs.existsSync(poolsPath)).toBe(true);
    expect(fs.existsSync(zwemPath)).toBe(true);
    expect(fs.existsSync(woonplaatsenPath)).toBe(true);

    const municipalities = JSON.parse(fs.readFileSync(munPath, 'utf-8'));
    const curatedPools = JSON.parse(fs.readFileSync(poolsPath, 'utf-8'));
    const zwemData = JSON.parse(fs.readFileSync(zwemPath, 'utf-8'));
    const woonplaatsen = JSON.parse(fs.readFileSync(woonplaatsenPath, 'utf-8'));

    expect(municipalities.length).toBeGreaterThanOrEqual(342);
    expect(curatedPools.length).toBeGreaterThanOrEqual(650);
    expect(zwemData.spots.length).toBeGreaterThanOrEqual(900);
    expect(woonplaatsen.length).toBeGreaterThanOrEqual(2500);
  });

  it('contains over 500 venues in database with preserved flagships', async () => {
    let db = getBuildDatabase();
    let venues = listAllVenues(db);
    if (venues.length < 500) {
      db.close();
      await runNationalIngestion();
      db = getBuildDatabase();
      venues = listAllVenues(db);
    }
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

  it('populates woonplaatsen (>=2,500) and postcode_pc4 (>=2,000) including 1391 and 1383', () => {
    const db = getBuildDatabase();

    const wplCount = (db.prepare('SELECT count(*) as c FROM woonplaatsen').get() as { c: number }).c;
    expect(wplCount).toBeGreaterThanOrEqual(2500);

    const pc4Count = (db.prepare('SELECT count(*) as c FROM postcode_pc4').get() as { c: number }).c;
    expect(pc4Count).toBeGreaterThanOrEqual(2000);

    const pc4_1391 = db.prepare('SELECT * FROM postcode_pc4 WHERE pc4 = ?').get('1391') as { pc4: string; municipality_slug: string } | undefined;
    expect(pc4_1391).toBeDefined();
    expect(pc4_1391?.municipality_slug).toBe('de-ronde-venen');

    const pc4_1383 = db.prepare('SELECT * FROM postcode_pc4 WHERE pc4 = ?').get('1383') as { pc4: string; municipality_slug: string } | undefined;
    expect(pc4_1383).toBeDefined();
    expect(pc4_1383?.municipality_slug).toBe('amsterdam');

    db.close();
  });

  it('contains >=650 non-open-water pools covering >=280 distinct municipalities with default basins', () => {
    const db = getBuildDatabase();

    const nonOpenWaterCount = (
      db.prepare("SELECT count(*) as c FROM venues WHERE venue_type != 'OPEN_WATER_NATURAL'").get() as { c: number }
    ).c;
    expect(nonOpenWaterCount).toBeGreaterThanOrEqual(650);

    const munCoverageCount = (
      db.prepare("SELECT count(DISTINCT municipality_slug) as c FROM venues WHERE venue_type != 'OPEN_WATER_NATURAL'").get() as { c: number }
    ).c;
    expect(munCoverageCount).toBeGreaterThanOrEqual(280);

    // Every pool in venues has >= 1 row in basins with is_default_basin = 1
    const venuesWithoutDefaultBasin = (
      db.prepare(`
        SELECT count(*) as c FROM venues v
        WHERE NOT EXISTS (
          SELECT 1 FROM basins b WHERE b.venue_id = v.id AND b.is_default_basin = 1
        )
      `).get() as { c: number }
    ).c;
    expect(venuesWithoutDefaultBasin).toBe(0);

    db.close();
  });

  it('correctly maps Het Sporthuis Abcoude and Victoriabad Weesp with correct geographic keys', () => {
    const db = getBuildDatabase();

    const sporthuis = db.prepare('SELECT * FROM venues WHERE slug = ?').get('het-sporthuis-abcoude') as {
      municipality_slug: string;
      woonplaats_id: string;
      woonplaats_slug: string;
      woonplaats_name: string;
      postcode_pc4: string;
    } | undefined;
    expect(sporthuis).toBeDefined();
    expect(sporthuis?.municipality_slug).toBe('de-ronde-venen');
    expect(sporthuis?.woonplaats_id).toBe('wpl-1332');
    expect(sporthuis?.woonplaats_slug).toBe('abcoude');
    expect(sporthuis?.woonplaats_name).toBe('Abcoude');
    expect(sporthuis?.postcode_pc4).toBe('1391');

    const victoriabad = db.prepare('SELECT * FROM venues WHERE slug = ?').get('victoriabad-weesp') as {
      municipality_slug: string;
      woonplaats_id: string;
      woonplaats_slug: string;
      woonplaats_name: string;
      postcode_pc4: string;
    } | undefined;
    expect(victoriabad).toBeDefined();
    expect(victoriabad?.municipality_slug).toBe('amsterdam');
    expect(victoriabad?.woonplaats_id).toBe('wpl-3631');
    expect(victoriabad?.woonplaats_slug).toBe('weesp');
    expect(victoriabad?.woonplaats_name).toBe('Weesp');
    expect(victoriabad?.postcode_pc4).toBe('1383');

    db.close();
  });

  it('correctly re-maps zwemwater spots in De Ronde Venen / Abcoude', () => {
    const db = getBuildDatabase();

    const speelsloot = db.prepare('SELECT * FROM venues WHERE slug = ?').get('hoge-dijk-speelsloot') as {
      municipality_slug: string;
      woonplaats_id: string;
      woonplaats_slug: string;
    } | undefined;
    expect(speelsloot).toBeDefined();
    expect(speelsloot?.municipality_slug).toBe('de-ronde-venen');
    expect(speelsloot?.woonplaats_id).toBe('wpl-1332');
    expect(speelsloot?.woonplaats_slug).toBe('abcoude');

    const strand = db.prepare('SELECT * FROM venues WHERE slug = ?').get('strand-de-hoge-dijk') as {
      municipality_slug: string;
      woonplaats_id: string;
      woonplaats_slug: string;
    } | undefined;
    expect(strand).toBeDefined();
    expect(strand?.municipality_slug).toBe('de-ronde-venen');
    expect(strand?.woonplaats_id).toBe('wpl-1332');
    expect(strand?.woonplaats_slug).toBe('abcoude');

    db.close();
  });

  it('finds nearby venues with findVenuesNearPostcodePc4 for 1391 and 1383', () => {
    const db = getBuildDatabase();

    const nearby1391 = findVenuesNearPostcodePc4(db, '1391', 10);
    expect(nearby1391.length).toBeGreaterThan(0);
    const hasAbcoude = nearby1391.some((v) => v.slug === 'het-sporthuis-abcoude' || v.woonplaats_slug === 'abcoude');
    expect(hasAbcoude).toBe(true);

    const nearby1383 = findVenuesNearPostcodePc4(db, '1383', 10);
    expect(nearby1383.length).toBeGreaterThan(0);
    const hasWeesp = nearby1383.some((v) => v.slug === 'victoriabad-weesp' || v.woonplaats_slug === 'weesp');
    expect(hasWeesp).toBe(true);

    db.close();
  });

  it('is idempotent on subsequent execution and preserves lastmod_at when content is unchanged', async () => {
    const db = getBuildDatabase();

    const beforeVenue = db.prepare('SELECT lastmod_at FROM venues WHERE slug = ?').get('het-sporthuis-abcoude') as {
      lastmod_at: string;
    } | undefined;
    expect(beforeVenue).toBeDefined();
    const beforeLastmod = beforeVenue?.lastmod_at;
    const beforeCount = (db.prepare('SELECT count(*) as c FROM venues').get() as { c: number }).c;
    db.close();

    // Re-run national ingestion
    await runNationalIngestion();

    const dbAfter = getBuildDatabase();
    const afterCount = (dbAfter.prepare('SELECT count(*) as c FROM venues').get() as { c: number }).c;
    expect(afterCount).toBe(beforeCount);

    const afterVenue = dbAfter.prepare('SELECT lastmod_at FROM venues WHERE slug = ?').get('het-sporthuis-abcoude') as {
      lastmod_at: string;
    } | undefined;
    expect(afterVenue).toBeDefined();
    expect(afterVenue?.lastmod_at).toBe(beforeLastmod);

    dbAfter.close();
  });
});
