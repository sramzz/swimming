import { describe, it, expect } from 'vitest';
import { createDatabase, applyDetailedSchema } from '@/db/client';

describe('SQLite / D1 Schema & Foreign Key Integrity', () => {
  it('applies database-context/schema-detailed.sql and enforces STRICT and CHECK constraints', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('municipalities');
    expect(tableNames).toContain('woonplaatsen');
    expect(tableNames).toContain('postcode_pc4');
    expect(tableNames).toContain('venues');
    expect(tableNames).toContain('basins');
    expect(tableNames).toContain('venue_swim_offerings');
    expect(tableNames).toContain('schedule_periods');
    expect(tableNames).toContain('tariffs');
    expect(tableNames).toContain('quarantined_anomalies');

    // Verify invalid FSM state is rejected by SQLite CHECK constraint
    expect(() => {
      db.prepare(
        `INSERT INTO municipalities (slug, cbs_code, name, province_slug, province_name, school_vacation_region, center_lat, center_lng)
         VALUES ('amsterdam', 'GM0363', 'Amsterdam', 'noord-holland', 'Noord-Holland', 'INVALID_REGION', 52.3676, 4.9041)`
      ).run();
    }).toThrow(/CHECK constraint failed/);

    db.close();
  });

  it('verifies woonplaatsen table structure, foreign keys, and unique constraints', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);

    // Insert parent municipality first
    db.prepare(
      `INSERT INTO municipalities (slug, cbs_code, name, province_slug, province_name, school_vacation_region, center_lat, center_lng)
       VALUES ('amsterdam', 'GM0363', 'Amsterdam', 'noord-holland', 'Noord-Holland', 'noord', 52.3676, 4.9041)`
    ).run();

    // Verify woonplaatsen columns
    const cols = db.prepare('PRAGMA table_info(woonplaatsen)').all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;
    const colMap = new Map(cols.map((c) => [c.name, c]));

    expect(colMap.get('id')?.pk).toBe(1);
    expect(colMap.get('bag_id')?.notnull).toBe(1);
    expect(colMap.get('slug')?.notnull).toBe(1);
    expect(colMap.get('name')?.notnull).toBe(1);
    expect(colMap.get('municipality_slug')?.notnull).toBe(1);
    expect(colMap.get('province_slug')?.notnull).toBe(1);
    expect(colMap.get('center_lat')?.notnull).toBe(1);
    expect(colMap.get('center_lng')?.notnull).toBe(1);
    expect(colMap.get('updated_at')?.notnull).toBe(1);

    // Insert valid woonplaats
    db.prepare(
      `INSERT INTO woonplaatsen (id, bag_id, slug, name, municipality_slug, province_slug, center_lat, center_lng)
       VALUES ('wpl-3594', '3594', 'amsterdam', 'Amsterdam', 'amsterdam', 'noord-holland', 52.3676, 4.9041)`
    ).run();

    // Duplicate bag_id must throw UNIQUE constraint failure
    expect(() => {
      db.prepare(
        `INSERT INTO woonplaatsen (id, bag_id, slug, name, municipality_slug, province_slug, center_lat, center_lng)
         VALUES ('wpl-9999', '3594', 'amsterdam-dupe', 'Amsterdam Dupe', 'amsterdam', 'noord-holland', 52.3676, 4.9041)`
      ).run();
    }).toThrow(/UNIQUE constraint failed/);

    // Duplicate slug must throw UNIQUE constraint failure
    expect(() => {
      db.prepare(
        `INSERT INTO woonplaatsen (id, bag_id, slug, name, municipality_slug, province_slug, center_lat, center_lng)
         VALUES ('wpl-9999', '9999', 'amsterdam', 'Amsterdam Dupe Slug', 'amsterdam', 'noord-holland', 52.3676, 4.9041)`
      ).run();
    }).toThrow(/UNIQUE constraint failed/);

    // FK constraint on invalid municipality_slug
    expect(() => {
      db.prepare(
        `INSERT INTO woonplaatsen (id, bag_id, slug, name, municipality_slug, province_slug, center_lat, center_lng)
         VALUES ('wpl-8888', '8888', 'non-existent', 'Non Existent', 'non-existent-gem', 'noord-holland', 52.0, 4.0)`
      ).run();
    }).toThrow(/FOREIGN KEY constraint failed/);

    db.close();
  });

  it('verifies venues and postcode_pc4 contain woonplaats reference columns and indexes', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);

    const venueCols = db.prepare('PRAGMA table_info(venues)').all() as Array<{ name: string }>;
    const venueColNames = venueCols.map((c) => c.name);
    expect(venueColNames).toContain('woonplaats_id');
    expect(venueColNames).toContain('woonplaats_slug');
    expect(venueColNames).toContain('woonplaats_name');

    const pc4Cols = db.prepare('PRAGMA table_info(postcode_pc4)').all() as Array<{ name: string }>;
    const pc4ColNames = pc4Cols.map((c) => c.name);
    expect(pc4ColNames).toContain('woonplaats_id');

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as Array<{ name: string }>;
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain('idx_woonplaatsen_municipality');
    expect(indexNames).toContain('idx_woonplaatsen_province');
    expect(indexNames).toContain('idx_woonplaatsen_name');
    expect(indexNames).toContain('idx_postcode_pc4_woonplaats_id');
    expect(indexNames).toContain('idx_venues_woonplaats_id');
    expect(indexNames).toContain('idx_venues_woonplaats_slug');
    expect(indexNames).toContain('idx_venues_postcode_pc4');

    db.close();
  });

  it('upgrades a legacy database without woonplaats columns idempotently', () => {
    const db = createDatabase(':memory:');

    // Simulate legacy DB schema before woonplaatsen and before new columns were added
    db.exec(`
      CREATE TABLE municipalities (
        slug TEXT PRIMARY KEY,
        cbs_code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        province_slug TEXT NOT NULL,
        province_name TEXT NOT NULL,
        school_vacation_region TEXT NOT NULL CHECK (school_vacation_region IN ('noord', 'midden', 'zuid')),
        center_lat REAL NOT NULL,
        center_lng REAL NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      ) STRICT;

      CREATE TABLE postcode_pc4 (
        pc4 TEXT PRIMARY KEY CHECK (length(pc4) = 4),
        municipality_slug TEXT NOT NULL REFERENCES municipalities(slug),
        lat REAL NOT NULL,
        lng REAL NOT NULL
      ) STRICT;

      CREATE TABLE venues (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        municipality_slug TEXT NOT NULL REFERENCES municipalities(slug),
        name TEXT NOT NULL,
        venue_type TEXT NOT NULL,
        enrichment_tier TEXT NOT NULL DEFAULT 'BASELINE',
        operational_state TEXT NOT NULL DEFAULT 'OPEN_REGULAR',
        street_address TEXT,
        postcode_pc6 TEXT,
        postcode_pc4 TEXT REFERENCES postcode_pc4(pc4),
        neighborhood_name TEXT,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        operator_name TEXT,
        is_nrz_licensed INTEGER NOT NULL DEFAULT 0,
        is_knzb_affiliated INTEGER NOT NULL DEFAULT 0,
        municipal_keurmerk_label TEXT,
        primary_water_treatment TEXT NOT NULL DEFAULT 'TRADITIONAL_CHLORINE',
        has_wheelchair_lift INTEGER NOT NULL DEFAULT 0,
        has_accessible_changing INTEGER NOT NULL DEFAULT 0,
        parking_info_nl TEXT,
        ev_chargers_count INTEGER DEFAULT 0,
        transit_chips_json TEXT NOT NULL DEFAULT '[]',
        municipal_pass_name TEXT,
        municipal_pass_discount_nl TEXT,
        google_maps_embed_url TEXT,
        google_maps_route_url TEXT,
        official_website_url TEXT,
        official_tickets_url TEXT,
        scraper_source_url TEXT,
        rating_score REAL,
        rating_count INTEGER NOT NULL DEFAULT 0,
        min_single_price_cents INTEGER,
        featured_badge_nl TEXT,
        hero_photos_json TEXT NOT NULL DEFAULT '[]',
        content_hash TEXT,
        lastmod_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        UNIQUE (municipality_slug, slug)
      ) STRICT;
    `);

    // Applying schema to legacy database must succeed without errors
    expect(() => applyDetailedSchema(db)).not.toThrow();
    // Idempotent second call must also succeed
    expect(() => applyDetailedSchema(db)).not.toThrow();

    const venueCols = db.prepare('PRAGMA table_info(venues)').all() as Array<{ name: string }>;
    const venueColNames = venueCols.map((c) => c.name);
    expect(venueColNames).toContain('woonplaats_id');
    expect(venueColNames).toContain('woonplaats_slug');
    expect(venueColNames).toContain('woonplaats_name');
    expect(venueColNames).toContain('zwemwater_metadata_json');

    const pc4Cols = db.prepare('PRAGMA table_info(postcode_pc4)').all() as Array<{ name: string }>;
    const pc4ColNames = pc4Cols.map((c) => c.name);
    expect(pc4ColNames).toContain('woonplaats_id');

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as Array<{ name: string }>;
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_woonplaatsen_municipality');
    expect(indexNames).toContain('idx_woonplaatsen_province');
    expect(indexNames).toContain('idx_woonplaatsen_name');
    expect(indexNames).toContain('idx_postcode_pc4_woonplaats_id');
    expect(indexNames).toContain('idx_venues_woonplaats_id');
    expect(indexNames).toContain('idx_venues_woonplaats_slug');
    expect(indexNames).toContain('idx_venues_postcode_pc4');

    db.close();
  });
});

