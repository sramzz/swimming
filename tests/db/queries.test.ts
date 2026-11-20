import { describe, it, expect } from 'vitest';
import { createDatabase, applyDetailedSchema } from '@/db/client';
import {
  isDistinctSubWoonplaats,
  listIndexableWoonplaatsen,
  listWoonplaatsenByMunicipality,
  resolveLocationBySlug,
} from '@/db/queries';
import {
  disambiguateZwemwaterName,
  extractStreetPrefix,
} from '@/cli/ingest-national';

describe('isDistinctSubWoonplaats helper', () => {
  it('returns false when any required identifier is missing or empty', () => {
    expect(isDistinctSubWoonplaats(null, 'amsterdam', 'Amsterdam', 'amsterdam')).toBe(false);
    expect(isDistinctSubWoonplaats('Amsterdam', null, 'Amsterdam', 'amsterdam')).toBe(false);
    expect(isDistinctSubWoonplaats('Amsterdam', 'amsterdam', null, 'amsterdam')).toBe(false);
    expect(isDistinctSubWoonplaats('Amsterdam', 'amsterdam', 'Amsterdam', null)).toBe(false);
    expect(isDistinctSubWoonplaats('', 'amsterdam', 'Amsterdam', 'amsterdam')).toBe(false);
    expect(isDistinctSubWoonplaats('Amsterdam', '', 'Amsterdam', 'amsterdam')).toBe(false);
  });

  it('returns false when woonplaats slug matches municipality slug', () => {
    expect(isDistinctSubWoonplaats('Amsterdam', 'amsterdam', 'Amsterdam', 'amsterdam')).toBe(false);
    expect(isDistinctSubWoonplaats('Utrecht', 'utrecht', 'Utrecht', 'utrecht')).toBe(false);
    expect(isDistinctSubWoonplaats('Eindhoven', 'eindhoven', 'Eindhoven', 'eindhoven')).toBe(false);
  });

  it('returns false for all 10 eponymous municipality seats with province/municipality suffixes', () => {
    // 1. Hoorn (slug hoorn-nh) in Hoorn
    expect(isDistinctSubWoonplaats('Hoorn', 'hoorn-nh', 'Hoorn', 'hoorn')).toBe(false);
    // 2. Beek (slug beek-lb) in Beek
    expect(isDistinctSubWoonplaats('Beek', 'beek-lb', 'Beek', 'beek')).toBe(false);
    // 3. Buren (slug buren-gd) in Buren
    expect(isDistinctSubWoonplaats('Buren', 'buren-gd', 'Buren', 'buren')).toBe(false);
    // 4. Laren (slug laren-nh) in Laren
    expect(isDistinctSubWoonplaats('Laren', 'laren-nh', 'Laren', 'laren')).toBe(false);
    // 5. Noordwijk (slug noordwijk-zh) in Noordwijk
    expect(isDistinctSubWoonplaats('Noordwijk', 'noordwijk-zh', 'Noordwijk', 'noordwijk')).toBe(false);
    // 6. Oosterhout (slug oosterhout-nb) in Oosterhout
    expect(isDistinctSubWoonplaats('Oosterhout', 'oosterhout-nb', 'Oosterhout', 'oosterhout')).toBe(false);
    // 7. Scherpenzeel (slug scherpenzeel-gd) in Scherpenzeel
    expect(isDistinctSubWoonplaats('Scherpenzeel', 'scherpenzeel-gd', 'Scherpenzeel', 'scherpenzeel')).toBe(false);
    // 8. Steenbergen (slug steenbergen-nb) in Steenbergen
    expect(isDistinctSubWoonplaats('Steenbergen', 'steenbergen-nb', 'Steenbergen', 'steenbergen')).toBe(false);
    // 9. Voorst (slug voorst-gd-voorst) in Voorst
    expect(isDistinctSubWoonplaats('Voorst', 'voorst-gd-voorst', 'Voorst', 'voorst')).toBe(false);
    // 10. Beuningen Gld (slug beuningen-gld) in Beuningen
    expect(isDistinctSubWoonplaats('Beuningen Gld', 'beuningen-gld', 'Beuningen', 'beuningen')).toBe(false);
  });

  it('returns true for genuine distinct sub-woonplaatsen across Dutch municipalities', () => {
    // Buren in Ameland (Friesland)
    expect(isDistinctSubWoonplaats('Buren', 'buren-fr', 'Ameland', 'ameland')).toBe(true);
    // Beek in Berg en Dal (Gelderland)
    expect(isDistinctSubWoonplaats('Beek', 'beek-gd-berg-en-dal', 'Berg en Dal', 'berg-en-dal')).toBe(true);
    // Weesp in Amsterdam
    expect(isDistinctSubWoonplaats('Weesp', 'weesp', 'Amsterdam', 'amsterdam')).toBe(true);
    // Abcoude in De Ronde Venen
    expect(isDistinctSubWoonplaats('Abcoude', 'abcoude', 'De Ronde Venen', 'de-ronde-venen')).toBe(true);
    // Scheveningen in Den Haag ('s-Gravenhage)
    expect(isDistinctSubWoonplaats('Scheveningen', 'scheveningen', "'s-Gravenhage", 'den-haag')).toBe(true);
  });
});

describe('listIndexableWoonplaatsen and listWoonplaatsenByMunicipality in SQLite', () => {
  it('filters out eponymous municipality seats from indexable woonplaatsen and sub-woonplaats listings', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);

    // Setup Municipalities
    db.prepare(`
      INSERT INTO municipalities (slug, cbs_code, name, province_slug, province_name, school_vacation_region, center_lat, center_lng)
      VALUES
        ('hoorn', 'GM0398', 'Hoorn', 'noord-holland', 'Noord-Holland', 'noord', 52.6425, 5.0597),
        ('beuningen', 'GM0209', 'Beuningen', 'gelderland', 'Gelderland', 'midden', 51.8600, 5.7667),
        ('amsterdam', 'GM0363', 'Amsterdam', 'noord-holland', 'Noord-Holland', 'noord', 52.3676, 4.9041)
    `).run();

    // Setup Woonplaatsen:
    // - hoorn-nh (eponymous seat of hoorn)
    // - zwaag (distinct sub-woonplaats in hoorn)
    // - beuningen-gld (eponymous seat of beuningen)
    // - ewijk (distinct sub-woonplaats in beuningen)
    // - amsterdam (eponymous seat of amsterdam, slug matches mun slug)
    // - weesp (distinct sub-woonplaats in amsterdam)
    db.prepare(`
      INSERT INTO woonplaatsen (id, bag_id, slug, name, municipality_slug, province_slug, center_lat, center_lng)
      VALUES
        ('wpl-hoorn', '1001', 'hoorn-nh', 'Hoorn', 'hoorn', 'noord-holland', 52.6425, 5.0597),
        ('wpl-zwaag', '1002', 'zwaag', 'Zwaag', 'hoorn', 'noord-holland', 52.6550, 5.0650),
        ('wpl-beuningen', '2001', 'beuningen-gld', 'Beuningen Gld', 'beuningen', 'gelderland', 51.8600, 5.7667),
        ('wpl-ewijk', '2002', 'ewijk', 'Ewijk', 'beuningen', 'gelderland', 51.8700, 5.7400),
        ('wpl-amsterdam', '3594', 'amsterdam', 'Amsterdam', 'amsterdam', 'noord-holland', 52.3676, 4.9041),
        ('wpl-weesp', '3631', 'weesp', 'Weesp', 'amsterdam', 'noord-holland', 52.3032, 5.0580)
    `).run();

    // Insert active venues in each woonplaats so COUNT(v.id) >= 1 holds
    const insertVenue = db.prepare(`
      INSERT INTO venues (
        id, slug, municipality_slug, name, venue_type, enrichment_tier, operational_state,
        street_address, postcode_pc6, postcode_pc4, woonplaats_id, woonplaats_slug, woonplaats_name,
        neighborhood_name, lat, lng, primary_water_treatment, rating_score, rating_count, min_single_price_cents
      ) VALUES (
        @id, @slug, @municipality_slug, @name, 'INDOOR_ONLY', 'BASELINE', 'OPEN_REGULAR',
        'Straat 1', '1000 AA', NULL, @woonplaats_id, @woonplaats_slug, @woonplaats_name,
        'Centrum', 52.0, 5.0, 'TRADITIONAL_CHLORINE', 4.5, 10, 500
      )
    `);

    insertVenue.run({ id: 'v1', slug: 'zwembad-hoorn', municipality_slug: 'hoorn', name: 'Zwembad Hoorn', woonplaats_id: 'wpl-hoorn', woonplaats_slug: 'hoorn-nh', woonplaats_name: 'Hoorn' });
    insertVenue.run({ id: 'v2', slug: 'zwembad-zwaag', municipality_slug: 'hoorn', name: 'Zwembad Zwaag', woonplaats_id: 'wpl-zwaag', woonplaats_slug: 'zwaag', woonplaats_name: 'Zwaag' });
    insertVenue.run({ id: 'v3', slug: 'zwembad-beuningen', municipality_slug: 'beuningen', name: 'Zwembad Beuningen', woonplaats_id: 'wpl-beuningen', woonplaats_slug: 'beuningen-gld', woonplaats_name: 'Beuningen Gld' });
    insertVenue.run({ id: 'v4', slug: 'zwembad-ewijk', municipality_slug: 'beuningen', name: 'Zwembad Ewijk', woonplaats_id: 'wpl-ewijk', woonplaats_slug: 'ewijk', woonplaats_name: 'Ewijk' });
    insertVenue.run({ id: 'v5', slug: 'zwembad-ams', municipality_slug: 'amsterdam', name: 'Zwembad Amsterdam', woonplaats_id: 'wpl-amsterdam', woonplaats_slug: 'amsterdam', woonplaats_name: 'Amsterdam' });
    insertVenue.run({ id: 'v6', slug: 'zwembad-weesp', municipality_slug: 'amsterdam', name: 'Zwembad Weesp', woonplaats_id: 'wpl-weesp', woonplaats_slug: 'weesp', woonplaats_name: 'Weesp' });

    // 1. listIndexableWoonplaatsen must only include distinct sub-woonplaatsen
    const indexable = listIndexableWoonplaatsen(db);
    const indexableSlugs = indexable.map((w) => w.slug);
    expect(indexableSlugs).toContain('zwaag');
    expect(indexableSlugs).toContain('ewijk');
    expect(indexableSlugs).toContain('weesp');

    // Eponymous seats must NEVER be indexable
    expect(indexableSlugs).not.toContain('hoorn-nh');
    expect(indexableSlugs).not.toContain('beuningen-gld');
    expect(indexableSlugs).not.toContain('amsterdam');

    // 2. listWoonplaatsenByMunicipality for Hoorn:
    // Should filter out hoorn-nh and only return distinct sub-woonplaats zwaag
    const hoornSub = listWoonplaatsenByMunicipality(db, 'hoorn');
    expect(hoornSub.map((w) => w.slug)).toEqual(['zwaag']);

    // 3. listWoonplaatsenByMunicipality for Beuningen:
    // Should filter out beuningen-gld and only return distinct sub-woonplaats ewijk
    const beuningenSub = listWoonplaatsenByMunicipality(db, 'beuningen');
    expect(beuningenSub.map((w) => w.slug)).toEqual(['ewijk']);

    db.close();
  });
});

describe('resolveLocationBySlug', () => {
  it('resolves municipality slugs cleanly', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);

    db.prepare(`
      INSERT INTO municipalities (slug, cbs_code, name, province_slug, province_name, school_vacation_region, center_lat, center_lng)
      VALUES ('hoorn', 'GM0398', 'Hoorn', 'noord-holland', 'Noord-Holland', 'noord', 52.6425, 5.0597)
    `).run();

    const resolved = resolveLocationBySlug(db, 'hoorn');
    expect(resolved).toEqual({
      type: 'municipality',
      cityName: 'Hoorn',
      municipalitySlug: 'hoorn',
      municipalityName: 'Hoorn',
    });

    db.close();
  });

  it('maps province-suffixed eponymous woonplaats slug to its parent municipality cleanly', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);

    db.prepare(`
      INSERT INTO municipalities (slug, cbs_code, name, province_slug, province_name, school_vacation_region, center_lat, center_lng)
      VALUES ('hoorn', 'GM0398', 'Hoorn', 'noord-holland', 'Noord-Holland', 'noord', 52.6425, 5.0597)
    `).run();

    db.prepare(`
      INSERT INTO woonplaatsen (id, bag_id, slug, name, municipality_slug, province_slug, center_lat, center_lng)
      VALUES ('wpl-hoorn', '1001', 'hoorn-nh', 'Hoorn', 'hoorn', 'noord-holland', 52.6425, 5.0597)
    `).run();

    const resolved = resolveLocationBySlug(db, 'hoorn-nh');
    expect(resolved).toEqual({
      type: 'municipality',
      cityName: 'Hoorn',
      municipalitySlug: 'hoorn',
      municipalityName: 'Hoorn',
    });

    db.close();
  });

  it('resolves genuine distinct sub-woonplaats slug to woonplaats type', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);

    db.prepare(`
      INSERT INTO municipalities (slug, cbs_code, name, province_slug, province_name, school_vacation_region, center_lat, center_lng)
      VALUES ('amsterdam', 'GM0363', 'Amsterdam', 'noord-holland', 'Noord-Holland', 'noord', 52.3676, 4.9041)
    `).run();

    db.prepare(`
      INSERT INTO woonplaatsen (id, bag_id, slug, name, municipality_slug, province_slug, center_lat, center_lng)
      VALUES ('wpl-weesp', '3631', 'weesp', 'Weesp', 'amsterdam', 'noord-holland', 52.3032, 5.0580)
    `).run();

    const resolved = resolveLocationBySlug(db, 'weesp');
    expect(resolved).toEqual({
      type: 'woonplaats',
      cityName: 'Weesp',
      municipalitySlug: 'amsterdam',
      municipalityName: 'Amsterdam',
      woonplaatsSlug: 'weesp',
      woonplaatsId: 'wpl-weesp',
    });

    db.close();
  });

  it('returns null for unknown slug', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);

    expect(resolveLocationBySlug(db, 'onbekende-plek')).toBeNull();

    db.close();
  });
});

describe('disambiguateZwemwaterName pure helper', () => {
  it('extracts street prefix cleanly from addressText', () => {
    expect(extractStreetPrefix('Parkweg , Bergen aan Zee', 'Bergen')).toBe('Parkweg');
    expect(extractStreetPrefix('Boulevard Barnaart , Zandvoort', 'Zandvoort')).toBe('Boulevard Barnaart');
    expect(extractStreetPrefix('Zeedijk 2, Uitdam', 'Uitdam')).toBe('Zeedijk 2');
    expect(extractStreetPrefix('Zandvoort', 'Zandvoort')).toBeNull();
    expect(extractStreetPrefix('', 'Zandvoort')).toBeNull();
    expect(extractStreetPrefix(null, 'Zandvoort')).toBeNull();
  });

  it('returns clean name unchanged when there is no collision', () => {
    const name = disambiguateZwemwaterName({
      name: 'Gaasperplas',
      spotid: '38123',
      addressText: 'Valburgdreef 1, Amsterdam',
      hasCollision: false,
    });
    expect(name).toBe('Gaasperplas');
  });

  it('formats with street prefix when collision exists and street prefix is available', () => {
    const name = disambiguateZwemwaterName({
      name: 'Bergen',
      spotid: '38511',
      addressText: 'Parkweg , Bergen aan Zee',
      hasCollision: true,
    });
    expect(name).toBe('Bergen (Parkweg)');
  });

  it('falls back to spotid when no street prefix is usable or matches town name', () => {
    const name = disambiguateZwemwaterName({
      name: 'Uitdam',
      spotid: '38456',
      addressText: 'Uitdam',
      hasCollision: true,
    });
    expect(name).toBe('Uitdam (38456)');
  });

  it('appends spotid when two spots in same municipality share the same street prefix', () => {
    const name1 = disambiguateZwemwaterName({
      name: 'Zandvoort',
      spotid: '38791',
      addressText: 'Boulevard Barnaart , Zandvoort',
      hasCollision: true,
      isPrefixColliding: true,
    });
    const name2 = disambiguateZwemwaterName({
      name: 'Zandvoort',
      spotid: '39020',
      addressText: 'Boulevard Barnaart , Zandvoort',
      hasCollision: true,
      isPrefixColliding: true,
    });

    expect(name1).toBe('Zandvoort (Boulevard Barnaart - 38791)');
    expect(name2).toBe('Zandvoort (Boulevard Barnaart - 39020)');
    expect(name1.toLowerCase()).not.toBe(name2.toLowerCase());
  });
});
