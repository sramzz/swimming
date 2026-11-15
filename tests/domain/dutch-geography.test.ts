import { describe, it, expect } from 'vitest';
import municipalitiesRaw from '../../src/data/dutch-municipalities.json';
import woonplaatsenRaw from '../../src/data/dutch-woonplaatsen.json';
import {
  slugifyNl,
  resolveDutchLocation,
  type BagWoonplaatsRecord,
} from '../../src/domain/dutch-geography';

describe('dutch-geography dataset integrity', () => {
  it('dutch-woonplaatsen.json has >= 2500 records and 100% unique keys', () => {
    const list = woonplaatsenRaw as BagWoonplaatsRecord[];
    expect(list.length).toBeGreaterThanOrEqual(2500);

    const validMunSlugs = new Set(
      municipalitiesRaw.map((m: { slug: string }) => m.slug)
    );

    const idSet = new Set<string>();
    const bagIdSet = new Set<string>();
    const slugSet = new Set<string>();

    for (const record of list) {
      expect(record.id).toBe(`wpl-${record.bag_id}`);

      expect(idSet.has(record.id)).toBe(false);
      idSet.add(record.id);

      expect(bagIdSet.has(record.bag_id)).toBe(false);
      bagIdSet.add(record.bag_id);

      expect(slugSet.has(record.slug)).toBe(false);
      slugSet.add(record.slug);

      expect(validMunSlugs.has(record.municipality_slug)).toBe(true);
      expect(typeof record.center_lat).toBe('number');
      expect(typeof record.center_lng).toBe('number');
      expect(record.center_lat).toBeGreaterThan(50.0);
      expect(record.center_lat).toBeLessThan(54.0);
      expect(record.center_lng).toBeGreaterThan(3.0);
      expect(record.center_lng).toBeLessThan(8.0);
    }

    expect(idSet.size).toBe(list.length);
    expect(bagIdSet.size).toBe(list.length);
    expect(slugSet.size).toBe(list.length);
  });
});

describe('slugifyNl', () => {
  it('handles Dutch prefixes with apostrophes', () => {
    expect(slugifyNl("'s-Hertogenbosch")).toBe('s-hertogenbosch');
    expect(slugifyNl("'s-Gravenhage")).toBe('s-gravenhage');
    expect(slugifyNl("'t Veld")).toBe('t-veld');
    expect(slugifyNl("'s Gravenmoer")).toBe('s-gravenmoer');
  });

  it('normalizes diacritics and special characters', () => {
    expect(slugifyNl('1e Exloërmond')).toBe('1e-exloermond');
    expect(slugifyNl('Bergen (NH)')).toBe('bergen-nh');
    expect(slugifyNl('Wijk bij Duurstede')).toBe('wijk-bij-duurstede');
  });
});

describe('resolveDutchLocation', () => {
  it('resolves Abcoude by placeName', () => {
    const res = resolveDutchLocation({
      placeName: 'Abcoude',
      lat: 52.273,
      lng: 4.971,
    });
    expect(res.woonplaatsSlug).toBe('abcoude');
    expect(res.municipalitySlug).toBe('de-ronde-venen');
    expect(res.municipalityName).toBe('De Ronde Venen');
    expect(res.provinceSlug).toBe('utrecht');
    // Actual BAG ID is 1332
    expect(res.woonplaatsId).toBe('wpl-1332');
    expect(res.woonplaatsBagId).toBe('1332');
  });

  it('resolves Weesp by placeName', () => {
    const res = resolveDutchLocation({
      placeName: 'Weesp',
      lat: 52.306,
      lng: 5.042,
    });
    expect(res.woonplaatsSlug).toBe('weesp');
    expect(res.municipalitySlug).toBe('amsterdam');
    expect(res.provinceSlug).toBe('noord-holland');
    // Actual BAG ID is 3631
    expect(res.woonplaatsId).toBe('wpl-3631');
    expect(res.woonplaatsBagId).toBe('3631');
  });

  it('supports custom woonplaatsen record array for mocks', () => {
    const mockWoonplaatsen: BagWoonplaatsRecord[] = [
      {
        id: 'wpl-1244',
        bag_id: '1244',
        slug: 'abcoude',
        name: 'Abcoude',
        municipality_slug: 'de-ronde-venen',
        municipality_name: 'De Ronde Venen',
        cbs_code: 'GM0736',
        province_slug: 'utrecht',
        center_lat: 52.273,
        center_lng: 4.971,
        primary_pc4: '1391',
      },
      {
        id: 'wpl-1241',
        bag_id: '1241',
        slug: 'weesp',
        name: 'Weesp',
        municipality_slug: 'amsterdam',
        municipality_name: 'Amsterdam',
        cbs_code: 'GM0363',
        province_slug: 'noord-holland',
        center_lat: 52.306,
        center_lng: 5.042,
        primary_pc4: '1381',
      },
    ];

    const resAbcoude = resolveDutchLocation(
      { placeName: 'Abcoude', lat: 52.273, lng: 4.971 },
      mockWoonplaatsen
    );
    expect(resAbcoude.woonplaatsId).toBe('wpl-1244');
    expect(resAbcoude.woonplaatsSlug).toBe('abcoude');
    expect(resAbcoude.municipalitySlug).toBe('de-ronde-venen');

    const resWeesp = resolveDutchLocation(
      { placeName: 'Weesp', lat: 52.306, lng: 5.042 },
      mockWoonplaatsen
    );
    expect(resWeesp.woonplaatsId).toBe('wpl-1241');
    expect(resWeesp.woonplaatsSlug).toBe('weesp');
    expect(resWeesp.municipalitySlug).toBe('amsterdam');
  });

  it('extracts place name from trailing comma in streetAddress (e.g. Abcouderstraatweg , Abcoude)', () => {
    const res1 = resolveDutchLocation({
      streetAddress: 'Abcouderstraatweg , Abcoude',
      lat: 52.288,
      lng: 4.962,
    });
    expect(res1.woonplaatsSlug).toBe('abcoude');
    expect(res1.municipalitySlug).toBe('de-ronde-venen');

    const res2 = resolveDutchLocation({
      streetAddress: 'Adcouderstraatweg , Abcoude',
      lat: 52.288,
      lng: 4.962,
    });
    expect(res2.woonplaatsSlug).toBe('abcoude');
    expect(res2.municipalitySlug).toBe('de-ronde-venen');
  });

  it('disambiguates homonyms like Valkenburg via haversine coords tie-breaking', () => {
    // Limburg Valkenburg coords
    const lbRes = resolveDutchLocation({
      placeName: 'Valkenburg',
      lat: 50.865,
      lng: 5.824,
    });
    expect(lbRes.woonplaatsSlug).toBe('valkenburg-lb');
    expect(lbRes.municipalitySlug).toBe('valkenburg-aan-de-geul');
    expect(lbRes.provinceSlug).toBe('limburg');

    // Zuid-Holland Valkenburg coords
    const zhRes = resolveDutchLocation({
      placeName: 'Valkenburg',
      lat: 52.17,
      lng: 4.43,
    });
    expect(zhRes.woonplaatsSlug).toBe('valkenburg-zh');
    expect(zhRes.municipalitySlug).toBe('katwijk');
    expect(zhRes.provinceSlug).toBe('zuid-holland');
  });

  it('bagWoonplaatsCode lookup takes precedence when provided', () => {
    // Pass Moordrecht's BAG code (1244) even with placeName 'Abcoude'
    const res = resolveDutchLocation({
      bagWoonplaatsCode: '1244',
      placeName: 'Abcoude',
      lat: 52.273,
      lng: 4.971,
    });
    expect(res.woonplaatsBagId).toBe('1244');
    expect(res.woonplaatsId).toBe('wpl-1244');
    expect(res.woonplaatsName).toBe('Moordrecht');
    expect(res.municipalitySlug).toBe('zuidplas');
  });

  it('normalizes Postcode PC6 and derives PC4', () => {
    const res = resolveDutchLocation({
      placeName: 'Abcoude',
      postcodePc6: '1391JN',
      lat: 52.273,
      lng: 4.971,
    });
    expect(res.postcodePc6).toBe('1391 JN');
    expect(res.postcodePc4).toBe('1391');

    const resSpaced = resolveDutchLocation({
      placeName: 'Abcoude',
      postcodePc6: '1391 jn',
      lat: 52.273,
      lng: 4.971,
    });
    expect(resSpaced.postcodePc6).toBe('1391 JN');
    expect(resSpaced.postcodePc4).toBe('1391');
  });

  it('falls back to nearest haversine woonplaats when placeName is omitted', () => {
    // Coords near Domtoren Utrecht
    const res = resolveDutchLocation({
      lat: 52.0907,
      lng: 5.1214,
    });
    expect(res.woonplaatsSlug).toBe('utrecht');
    expect(res.municipalitySlug).toBe('utrecht');
  });

  it('resolves southeast Amsterdam addresses to Amsterdam rather than Weesp despite proximity', () => {
    const res = resolveDutchLocation({
      streetAddress: 'Anton de Komplein 157, 1102 CW Amsterdam',
      lat: 52.3138,
      lng: 4.9562,
    });
    expect(res.woonplaatsSlug).toBe('amsterdam');
    expect(res.woonplaatsId).toBe('wpl-3594');
    expect(res.municipalitySlug).toBe('amsterdam');

    const ijburgRes = resolveDutchLocation({
      streetAddress: 'Pampuslaan , Amsterdam',
      lat: 52.358,
      lng: 5.013,
    });
    expect(ijburgRes.woonplaatsSlug).toBe('amsterdam');
    expect(ijburgRes.woonplaatsId).toBe('wpl-3594');
    expect(ijburgRes.municipalitySlug).toBe('amsterdam');
  });
});
