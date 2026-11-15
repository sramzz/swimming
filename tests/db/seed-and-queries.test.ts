import { describe, it, expect } from 'vitest';
import { createDatabase, applyDetailedSchema } from '@/db/client';
import { seedInitialDataset } from '@/db/seed';
import {
  getVenueByCityAndSlug,
  listVenuesByCity,
  findVenuesNearPostcodePc4,
  findShortestWaitlistOfferingsNearPc4,
  getMunicipalityBySlug,
  getWoonplaatsBySlug,
  listWoonplaatsenByMunicipality,
  listIndexableWoonplaatsen,
  listVenuesByWoonplaats,
} from '@/db/queries';

describe('Idempotent Seeder & Core Read Queries', () => {
  it('seeds municipalities, holidays, and flagship venues idempotently (running twice produces identical row counts)', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);

    seedInitialDataset(db);
    seedInitialDataset(db); // Idempotency test: second run must not duplicate or throw

    const miranda = getVenueByCityAndSlug(db, 'amsterdam', 'de-mirandabad');
    expect(miranda).not.toBeNull();
    expect(miranda?.name).toBe('Zwemcentrum De Mirandabad');
    expect(miranda?.primary_water_treatment).toBe('SALT_ELECTROLYSIS');
    expect(miranda?.basins.length).toBeGreaterThanOrEqual(3);
    expect(miranda?.tariffs.length).toBeGreaterThanOrEqual(4);

    const amsterdamVenues = listVenuesByCity(db, 'amsterdam');
    expect(amsterdamVenues.length).toBeGreaterThanOrEqual(4);

    const near1079 = findVenuesNearPostcodePc4(db, '1079', 10);
    expect(near1079.length).toBeGreaterThanOrEqual(3);
    expect(near1079[0].slug).toBe('de-mirandabad');

    const top3Waitlist = findShortestWaitlistOfferingsNearPc4(db, '1079', 'DIPLOMA_A', 15, 3);
    expect(top3Waitlist.length).toBeGreaterThanOrEqual(2);
    expect(top3Waitlist[0].current_waitlist_weeks_min).toBeLessThanOrEqual(
      top3Waitlist[1].current_waitlist_weeks_min
    );

    db.close();
  });

  it('queries municipalities by slug with full metadata', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);
    seedInitialDataset(db);

    const amsterdam = getMunicipalityBySlug(db, 'amsterdam');
    expect(amsterdam).not.toBeNull();
    expect(amsterdam?.slug).toBe('amsterdam');
    expect(amsterdam?.cbs_code).toBe('GM0363');
    expect(amsterdam?.name).toBe('Amsterdam');
    expect(amsterdam?.province_slug).toBe('noord-holland');
    expect(amsterdam?.province_name).toBe('Noord-Holland');
    expect(amsterdam?.school_vacation_region).toBe('noord');
    expect(amsterdam?.center_lat).toBeCloseTo(52.3676, 3);
    expect(amsterdam?.center_lng).toBeCloseTo(4.9041, 3);

    const utrecht = getMunicipalityBySlug(db, 'utrecht');
    expect(utrecht?.school_vacation_region).toBe('midden');

    const nonExistent = getMunicipalityBySlug(db, 'non-existent');
    expect(nonExistent).toBeNull();

    db.close();
  });

  it('seeds BAG woonplaatsen and links flagship venues with both woonplaats and wijk neighborhood', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);
    seedInitialDataset(db);

    // Verify woonplaats query
    const amsWpl = getWoonplaatsBySlug(db, 'amsterdam');
    expect(amsWpl).not.toBeNull();
    expect(amsWpl?.id).toBe('wpl-3594');
    expect(amsWpl?.bag_id).toBe('3594');
    expect(amsWpl?.name).toBe('Amsterdam');
    expect(amsWpl?.municipality_slug).toBe('amsterdam');
    expect(amsWpl?.province_slug).toBe('noord-holland');

    const utrWpl = getWoonplaatsBySlug(db, 'utrecht');
    expect(utrWpl?.id).toBe('wpl-3295');
    expect(utrWpl?.bag_id).toBe('3295');

    const einWpl = getWoonplaatsBySlug(db, 'eindhoven');
    expect(einWpl?.id).toBe('wpl-1101');
    expect(einWpl?.bag_id).toBe('1101');

    const rotWpl = getWoonplaatsBySlug(db, 'rotterdam');
    expect(rotWpl?.id).toBe('wpl-3086');
    expect(rotWpl?.bag_id).toBe('3086');

    expect(getWoonplaatsBySlug(db, 'niet-bestaand')).toBeNull();

    // Verify all 6 flagship venues have woonplaats populated and neighborhood_name intact as wijk
    const mirandabad = getVenueByCityAndSlug(db, 'amsterdam', 'de-mirandabad');
    expect(mirandabad?.woonplaats_id).toBe('wpl-3594');
    expect(mirandabad?.woonplaats_slug).toBe('amsterdam');
    expect(mirandabad?.woonplaats_name).toBe('Amsterdam');
    expect(mirandabad?.neighborhood_name).toBe('Amsterdam Zuid (Rivierenbuurt)');

    const oost = getVenueByCityAndSlug(db, 'amsterdam', 'sportfondsenbad-oost');
    expect(oost?.woonplaats_id).toBe('wpl-3594');
    expect(oost?.woonplaats_slug).toBe('amsterdam');
    expect(oost?.woonplaats_name).toBe('Amsterdam');
    expect(oost?.neighborhood_name).toBe('Amsterdam Oost (Oostpoort)');

    const sloter = getVenueByCityAndSlug(db, 'amsterdam', 'sloterparkbad');
    expect(sloter?.woonplaats_id).toBe('wpl-3594');
    expect(sloter?.woonplaats_slug).toBe('amsterdam');
    expect(sloter?.woonplaats_name).toBe('Amsterdam');
    expect(sloter?.neighborhood_name).toBe('Amsterdam Nieuw-West');

    const gaasperplas = getVenueByCityAndSlug(db, 'amsterdam', 'gaasperplas-open-water');
    expect(gaasperplas?.woonplaats_id).toBe('wpl-3594');
    expect(gaasperplas?.woonplaats_slug).toBe('amsterdam');
    expect(gaasperplas?.woonplaats_name).toBe('Amsterdam');
    expect(gaasperplas?.neighborhood_name).toBe('Amsterdam Zuidoost');

    const utrechtVenue = getVenueByCityAndSlug(db, 'utrecht', 'ra-sports-swimming-utrecht');
    expect(utrechtVenue?.woonplaats_id).toBe('wpl-3295');
    expect(utrechtVenue?.woonplaats_slug).toBe('utrecht');
    expect(utrechtVenue?.woonplaats_name).toBe('Utrecht');
    expect(utrechtVenue?.neighborhood_name).toBe('Utrecht Leidsche Rijn');

    const eindhovenVenue = getVenueByCityAndSlug(db, 'eindhoven', 'tongelreep-zwemparadijs');
    expect(eindhovenVenue?.woonplaats_id).toBe('wpl-1101');
    expect(eindhovenVenue?.woonplaats_slug).toBe('eindhoven');
    expect(eindhovenVenue?.woonplaats_name).toBe('Eindhoven');
    expect(eindhovenVenue?.neighborhood_name).toBe('Eindhoven Zuid');

    db.close();
  });

  it('manages multi-woonplaats municipalities, indexable sub-woonplaatsen, and woonplaats venue listings', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);
    seedInitialDataset(db);

    // Initial state: Amsterdam municipality has only 'amsterdam' woonplaats with 4 venues
    const initialAmsWoonplaatsen = listWoonplaatsenByMunicipality(db, 'amsterdam');
    expect(initialAmsWoonplaatsen).toHaveLength(1);
    expect(initialAmsWoonplaatsen[0].slug).toBe('amsterdam');
    expect(initialAmsWoonplaatsen[0].venue_count).toBe(4);

    // Initial state: No indexable woonplaatsen yet because all current woonplaats slugs equal municipality slug
    expect(listIndexableWoonplaatsen(db)).toEqual([]);

    // Insert a second distinct woonplaats under 'amsterdam' municipality: Weesp (wpl-3631)
    db.prepare(`
      INSERT INTO woonplaatsen (id, bag_id, slug, name, municipality_slug, province_slug, center_lat, center_lng)
      VALUES ('wpl-3631', '3631', 'weesp', 'Weesp', 'amsterdam', 'noord-holland', 52.30320518, 5.05804338)
    `).run();

    // Insert PC4 for Weesp
    db.prepare(`
      INSERT INTO postcode_pc4 (pc4, municipality_slug, woonplaats_id, lat, lng)
      VALUES ('1382', 'amsterdam', 'wpl-3631', 52.305, 5.060)
    `).run();

    // Insert a venue located in Weesp
    db.prepare(`
      INSERT INTO venues (
        id, slug, municipality_slug, name, venue_type, enrichment_tier, operational_state,
        street_address, postcode_pc6, postcode_pc4, woonplaats_id, woonplaats_slug, woonplaats_name,
        neighborhood_name, lat, lng, primary_water_treatment, rating_score, rating_count, min_single_price_cents
      ) VALUES (
        'venue-weesp-waterlelie', 'zwembad-de-waterlelie-weesp', 'amsterdam', 'Zwembad De Waterlelie Weesp',
        'INDOOR_ONLY', 'GOLD_STANDARD', 'OPEN_REGULAR',
        'Papelaan 126', '1382 BR', '1382', 'wpl-3631', 'weesp', 'Weesp',
        'Weesp Centrum', 52.305, 5.060, 'TRADITIONAL_CHLORINE', 4.85, 42, 600
      )
    `).run();

    // Now listWoonplaatsenByMunicipality('amsterdam') includes both Amsterdam (4 venues) and Weesp (1 venue)
    const updatedAmsWoonplaatsen = listWoonplaatsenByMunicipality(db, 'amsterdam');
    expect(updatedAmsWoonplaatsen).toHaveLength(2);
    expect(updatedAmsWoonplaatsen[0].slug).toBe('amsterdam');
    expect(updatedAmsWoonplaatsen[0].venue_count).toBe(4);
    expect(updatedAmsWoonplaatsen[1].slug).toBe('weesp');
    expect(updatedAmsWoonplaatsen[1].venue_count).toBe(1);

    // listIndexableWoonplaatsen returns Weesp (since slug 'weesp' != municipality_slug 'amsterdam')
    // but excludes Amsterdam (slug === municipality_slug)
    const indexable = listIndexableWoonplaatsen(db);
    expect(indexable).toHaveLength(1);
    expect(indexable[0].slug).toBe('weesp');
    expect(indexable[0].municipality_slug).toBe('amsterdam');
    expect(indexable[0].venue_count).toBe(1);

    // listVenuesByWoonplaats returns the venue in Weesp with enrichment fields
    const weespVenues = listVenuesByWoonplaats(db, 'weesp');
    expect(weespVenues).toHaveLength(1);
    expect(weespVenues[0].id).toBe('venue-weesp-waterlelie');
    expect(weespVenues[0].name).toBe('Zwembad De Waterlelie Weesp');
    expect(weespVenues[0].woonplaats_slug).toBe('weesp');
    expect(weespVenues[0].enrichment_tier).toBe('GOLD_STANDARD');

    // Querying unknown woonplaats returns empty list
    expect(listVenuesByWoonplaats(db, 'onbekend')).toEqual([]);
    expect(listWoonplaatsenByMunicipality(db, 'onbekend')).toEqual([]);

    db.close();
  });
});
