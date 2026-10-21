import type { SqliteDatabase } from './client';

export function seedInitialDataset(db: SqliteDatabase): void {
  const tx = db.transaction(() => {
    // 1. Municipalities
    const upsertMunicipality = db.prepare(`
      INSERT INTO municipalities (slug, cbs_code, name, province_slug, province_name, school_vacation_region, center_lat, center_lng)
      VALUES (@slug, @cbs_code, @name, @province_slug, @province_name, @school_vacation_region, @center_lat, @center_lng)
      ON CONFLICT(slug) DO UPDATE SET
        name = excluded.name,
        school_vacation_region = excluded.school_vacation_region,
        center_lat = excluded.center_lat,
        center_lng = excluded.center_lng
    `);

    const municipalities = [
      { slug: 'amsterdam', cbs_code: 'GM0363', name: 'Amsterdam', province_slug: 'noord-holland', province_name: 'Noord-Holland', school_vacation_region: 'noord', center_lat: 52.3676, center_lng: 4.9041 },
      { slug: 'utrecht', cbs_code: 'GM0344', name: 'Utrecht', province_slug: 'utrecht', province_name: 'Utrecht', school_vacation_region: 'midden', center_lat: 52.0907, center_lng: 5.1214 },
      { slug: 'eindhoven', cbs_code: 'GM0772', name: 'Eindhoven', province_slug: 'noord-brabant', province_name: 'Noord-Brabant', school_vacation_region: 'zuid', center_lat: 51.4416, center_lng: 5.4697 },
      { slug: 'rotterdam', cbs_code: 'GM0599', name: 'Rotterdam', province_slug: 'zuid-holland', province_name: 'Zuid-Holland', school_vacation_region: 'midden', center_lat: 51.9244, center_lng: 4.4777 },
    ];
    for (const m of municipalities) upsertMunicipality.run(m);

    // 2. Postcode PC4 centroids
    const upsertPc4 = db.prepare(`
      INSERT INTO postcode_pc4 (pc4, municipality_slug, lat, lng)
      VALUES (@pc4, @municipality_slug, @lat, @lng)
      ON CONFLICT(pc4) DO UPDATE SET lat = excluded.lat, lng = excluded.lng
    `);
    const pc4List = [
      { pc4: '1079', municipality_slug: 'amsterdam', lat: 52.3387, lng: 4.9021 },
      { pc4: '1093', municipality_slug: 'amsterdam', lat: 52.3564, lng: 4.9275 },
      { pc4: '1064', municipality_slug: 'amsterdam', lat: 52.3718, lng: 4.8054 },
      { pc4: '1108', municipality_slug: 'amsterdam', lat: 52.3095, lng: 4.9912 },
      { pc4: '3544', municipality_slug: 'utrecht', lat: 52.0985, lng: 5.0542 },
      { pc4: '5644', municipality_slug: 'eindhoven', lat: 51.4162, lng: 5.4792 },
    ];
    for (const p of pc4List) upsertPc4.run(p);

    // 3. Dutch Public Holidays & School Vacations
    db.prepare(`
      INSERT INTO nl_public_holidays (holiday_date, name_nl, is_national)
      VALUES ('2026-04-27', 'Koningsdag', 1), ('2026-12-25', 'Eerste Kerstdag', 1), ('2026-12-26', 'Tweede Kerstdag', 1)
      ON CONFLICT(holiday_date) DO NOTHING
    `).run();

    db.prepare(`
      INSERT INTO nl_school_vacations (id, school_year, vacation_name, region, start_date, end_date, scrape_trigger_date)
      VALUES
        ('2026-herfst-noord', '2026-2027', 'Herfstvakantie', 'noord', '2026-10-17', '2026-10-25', '2026-10-03'),
        ('2026-herfst-midden', '2026-2027', 'Herfstvakantie', 'midden', '2026-10-17', '2026-10-25', '2026-10-03'),
        ('2026-herfst-zuid', '2026-2027', 'Herfstvakantie', 'zuid', '2026-10-24', '2026-11-01', '2026-10-10')
      ON CONFLICT(id) DO NOTHING
    `).run();

    // 4. Flagship Venues from Mockups
    const upsertVenue = db.prepare(`
      INSERT INTO venues (
        id, slug, municipality_slug, name, venue_type, enrichment_tier, operational_state,
        street_address, postcode_pc6, postcode_pc4, neighborhood_name, lat, lng,
        operator_name, is_nrz_licensed, is_knzb_affiliated, municipal_keurmerk_label,
        primary_water_treatment, has_wheelchair_lift, has_accessible_changing,
        parking_info_nl, ev_chargers_count, transit_chips_json,
        municipal_pass_name, municipal_pass_discount_nl,
        google_maps_embed_url, google_maps_route_url, official_website_url, official_tickets_url,
        rating_score, rating_count, min_single_price_cents, featured_badge_nl, content_hash
      ) VALUES (
        @id, @slug, @municipality_slug, @name, @venue_type, 'GOLD_STANDARD', 'OPEN_REGULAR',
        @street_address, @postcode_pc6, @postcode_pc4, @neighborhood_name, @lat, @lng,
        @operator_name, @is_nrz_licensed, @is_knzb_affiliated, @municipal_keurmerk_label,
        @primary_water_treatment, @has_wheelchair_lift, @has_accessible_changing,
        @parking_info_nl, @ev_chargers_count, @transit_chips_json,
        @municipal_pass_name, @municipal_pass_discount_nl,
        @google_maps_embed_url, @google_maps_route_url, @official_website_url, @official_tickets_url,
        @rating_score, @rating_count, @min_single_price_cents, @featured_badge_nl, 'seed-v1'
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        min_single_price_cents = excluded.min_single_price_cents,
        primary_water_treatment = excluded.primary_water_treatment
    `);

    const venues = [
      {
        id: 'venue-de-mirandabad',
        slug: 'de-mirandabad',
        municipality_slug: 'amsterdam',
        name: 'Zwemcentrum De Mirandabad',
        venue_type: 'SUBTROPICAL_PARADISE',
        street_address: 'De Mirandalaan 9',
        postcode_pc6: '1079 PA',
        postcode_pc4: '1079',
        neighborhood_name: 'Amsterdam Zuid (Rivierenbuurt)',
        lat: 52.3387,
        lng: 4.9021,
        operator_name: 'Gemeente Amsterdam Sportbedrijf',
        is_nrz_licensed: 1,
        is_knzb_affiliated: 1,
        municipal_keurmerk_label: 'Gemeente Amsterdam Keurmerk',
        primary_water_treatment: 'SALT_ELECTROLYSIS',
        has_wheelchair_lift: 1,
        has_accessible_changing: 1,
        parking_info_nl: 'Eigen parkeerterrein (€ 1,60/uur) + 12 laadpalen',
        ev_chargers_count: 12,
        transit_chips_json: JSON.stringify([
          { icon: 'tram', title: 'Tram 4 & 12', subtitle: 'Halte Waalstraat (4 min lopen)' },
          { icon: 'subway', title: 'Metro 52 & Station RAI', subtitle: 'Noord-Zuidlijn (8 min lopen)' },
          { icon: 'ev_station', title: 'Parkeren & Laadpalen', subtitle: 'Ruime parkeerplaats + 12 laadpalen' },
        ]),
        municipal_pass_name: 'Stadspas Amsterdam',
        municipal_pass_discount_nl: 'Stadspas met groene stip geeft recht op tot 80% korting op losse entree en zwemles.',
        google_maps_embed_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2437.747368127331!2d4.89994657661537!3d52.33872904963466!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47c60a25f227d8db%3A0xe3011aca3528d059!2sDe%20Mirandabad!5e0!3m2!1sen!2snl',
        google_maps_route_url: 'https://www.google.com/maps/dir/?api=1&destination=De+Mirandalaan+9+Amsterdam',
        official_website_url: 'https://www.amsterdam.nl/demirandabad/',
        official_tickets_url: 'https://www.amsterdam.nl/demirandabad/#tarieven',
        rating_score: 4.92,
        rating_count: 312,
        min_single_price_cents: 820,
        featured_badge_nl: 'Populairste Keuze',
      },
      {
        id: 'venue-sportfondsenbad-oost',
        slug: 'sportfondsenbad-oost',
        municipality_slug: 'amsterdam',
        name: 'Sportfondsenbad Amsterdam-Oost',
        venue_type: 'INDOOR_ONLY',
        street_address: 'Land van Cocagneplein 44',
        postcode_pc6: '1093 NB',
        postcode_pc4: '1093',
        neighborhood_name: 'Amsterdam Oost (Oostpoort)',
        lat: 52.3564,
        lng: 4.9275,
        operator_name: 'Sportfondsen Nederland',
        is_nrz_licensed: 1,
        is_knzb_affiliated: 1,
        municipal_keurmerk_label: 'NRZ Licentiehouder',
        primary_water_treatment: 'TRADITIONAL_CHLORINE',
        has_wheelchair_lift: 1,
        has_accessible_changing: 1,
        parking_info_nl: 'Parkeergarage Oostpoort op 150m',
        ev_chargers_count: 6,
        transit_chips_json: JSON.stringify([
          { icon: 'train', title: 'Station Muiderpoort', subtitle: '5 min lopen' },
          { icon: 'tram', title: 'Tram 1, 3 & 19', subtitle: 'Halte Wijttenbachstraat' },
        ]),
        municipal_pass_name: 'Stadspas Amsterdam',
        municipal_pass_discount_nl: 'Korting op banenzwemmen en Jeugdfonds Sport & Cultuur.',
        google_maps_embed_url: null,
        google_maps_route_url: 'https://www.google.com/maps/dir/?api=1&destination=Land+van+Cocagneplein+44+Amsterdam',
        official_website_url: 'https://sportfondsenbadoost.nl',
        official_tickets_url: 'https://sportfondsenbadoost.nl/tarieven',
        rating_score: 4.86,
        rating_count: 128,
        min_single_price_cents: 650,
        featured_badge_nl: null,
      },
      {
        id: 'venue-sloterparkbad',
        slug: 'sloterparkbad',
        municipality_slug: 'amsterdam',
        name: 'Sloterparkbad (Zwemschool De Dolfijn)',
        venue_type: 'INDOOR_AND_OUTDOOR',
        street_address: 'President Allendelaan 3',
        postcode_pc6: '1064 GW',
        postcode_pc4: '1064',
        neighborhood_name: 'Amsterdam Nieuw-West',
        lat: 52.3718,
        lng: 4.8054,
        operator_name: 'Optisport / Zwemschool De Dolfijn',
        is_nrz_licensed: 1,
        is_knzb_affiliated: 1,
        municipal_keurmerk_label: 'NRZ Licentiehouder',
        primary_water_treatment: 'SALT_ELECTROLYSIS',
        has_wheelchair_lift: 1,
        has_accessible_changing: 1,
        parking_info_nl: 'Gratis parkeren (blauwe zone 2,5 uur)',
        ev_chargers_count: 8,
        transit_chips_json: JSON.stringify([
          { icon: 'tram', title: 'Tram 13', subtitle: 'Halte Sloterparkbad' },
        ]),
        municipal_pass_name: 'Stadspas Amsterdam',
        municipal_pass_discount_nl: 'Stadspas geldig voor vrijzwemmen en zwemles.',
        google_maps_embed_url: null,
        google_maps_route_url: 'https://www.google.com/maps/dir/?api=1&destination=President+Allendelaan+3+Amsterdam',
        official_website_url: 'https://www.optisport.nl/sloterparkbad',
        official_tickets_url: 'https://www.optisport.nl/sloterparkbad',
        rating_score: 4.95,
        rating_count: 84,
        min_single_price_cents: 695,
        featured_badge_nl: 'NRZ Licentiehouder',
      },
      {
        id: 'venue-gaasperplas',
        slug: 'gaasperplas-open-water',
        municipality_slug: 'amsterdam',
        name: 'Gaasperplas Open Water Spot',
        venue_type: 'OPEN_WATER_NATURAL',
        street_address: 'Langbroekdreef',
        postcode_pc6: '1108 AZ',
        postcode_pc4: '1108',
        neighborhood_name: 'Amsterdam Zuidoost',
        lat: 52.3095,
        lng: 4.9912,
        operator_name: 'Rijkswaterstaat / Provincie Noord-Holland',
        is_nrz_licensed: 0,
        is_knzb_affiliated: 1,
        municipal_keurmerk_label: 'Schoon Zwemwater Keurmerk',
        primary_water_treatment: 'NATURAL_UNTREATED',
        has_wheelchair_lift: 0,
        has_accessible_changing: 0,
        parking_info_nl: 'Gratis parkeren bij Gaasperpark',
        ev_chargers_count: 4,
        transit_chips_json: JSON.stringify([
          { icon: 'subway', title: 'Metro 53', subtitle: 'Eindhalte Gaasperplas (3 min lopen)' },
        ]),
        municipal_pass_name: null,
        municipal_pass_discount_nl: null,
        google_maps_embed_url: null,
        google_maps_route_url: 'https://www.google.com/maps/dir/?api=1&destination=Gaasperplas+Amsterdam',
        official_website_url: 'https://www.zwemwater.nl',
        official_tickets_url: 'https://www.zwemwater.nl',
        rating_score: 4.78,
        rating_count: 95,
        min_single_price_cents: 0,
        featured_badge_nl: 'Natuurwater',
      },
      {
        id: 'venue-ra-utrecht',
        slug: 'ra-sports-swimming-utrecht',
        municipality_slug: 'utrecht',
        name: 'R&A Sports & Swimming - Utrecht',
        venue_type: 'BOUTIQUE_SWIM_SCHOOL_POOL',
        street_address: 'Grebbeberglaan 15',
        postcode_pc6: '3527 VX',
        postcode_pc4: '3544',
        neighborhood_name: 'Utrecht Leidsche Rijn',
        lat: 52.0985,
        lng: 5.0542,
        operator_name: 'R&A Sports & Swimming',
        is_nrz_licensed: 1,
        is_knzb_affiliated: 1,
        municipal_keurmerk_label: 'Direct Beschikbaar',
        primary_water_treatment: 'SALT_ELECTROLYSIS',
        has_wheelchair_lift: 1,
        has_accessible_changing: 1,
        parking_info_nl: 'Gratis parkeren voor de deur',
        ev_chargers_count: 6,
        transit_chips_json: JSON.stringify([]),
        municipal_pass_name: 'U-pas',
        municipal_pass_discount_nl: 'U-pas tegoed inzetbaar voor zwemles.',
        google_maps_embed_url: null,
        google_maps_route_url: null,
        official_website_url: 'https://rasports.nl',
        official_tickets_url: 'https://rasports.nl',
        rating_score: 4.90,
        rating_count: 160,
        min_single_price_cents: 750,
        featured_badge_nl: 'Direct Beschikbaar',
      },
      {
        id: 'venue-tongelreep-eindhoven',
        slug: 'tongelreep-zwemparadijs',
        municipality_slug: 'eindhoven',
        name: 'Nationaal Zwemcentrum de Tongelreep',
        venue_type: 'INDOOR_ONLY',
        street_address: 'Antoon Coolenlaan 1',
        postcode_pc6: '5644 RX',
        postcode_pc4: '5644',
        neighborhood_name: 'Eindhoven Zuid',
        lat: 51.4162,
        lng: 5.4792,
        operator_name: 'Gemeente Eindhoven',
        is_nrz_licensed: 1,
        is_knzb_affiliated: 1,
        municipal_keurmerk_label: 'KNZB Topsportlocatie',
        primary_water_treatment: 'TRADITIONAL_CHLORINE',
        has_wheelchair_lift: 1,
        has_accessible_changing: 1,
        parking_info_nl: 'Gratis parkeren op P1/P2',
        ev_chargers_count: 10,
        transit_chips_json: JSON.stringify([]),
        municipal_pass_name: 'Meedoen-regeling Eindhoven',
        municipal_pass_discount_nl: 'Korting via gemeentelijke sportregeling.',
        google_maps_embed_url: null,
        google_maps_route_url: null,
        official_website_url: 'https://www.eindhovensport.nl/zwemmen',
        official_tickets_url: 'https://www.eindhovensport.nl/zwemmen',
        rating_score: 4.88,
        rating_count: 420,
        min_single_price_cents: 710,
        featured_badge_nl: '50m Olympisch',
      },
    ];
    for (const v of venues) upsertVenue.run(v);

    // 5. Basins for De Mirandabad + Default Basins for others
    const upsertBasin = db.prepare(`
      INSERT INTO basins (id, venue_id, name_nl, basin_category, is_default_basin, is_indoor, length_meters, lanes_count, has_movable_floor, water_treatment, target_temp_celsius, warm_water_day_note_nl)
      VALUES (@id, @venue_id, @name_nl, @basin_category, @is_default_basin, @is_indoor, @length_meters, @lanes_count, @has_movable_floor, @water_treatment, @target_temp_celsius, @warm_water_day_note_nl)
      ON CONFLICT(id) DO UPDATE SET target_temp_celsius = excluded.target_temp_celsius
    `);
    const basins = [
      { id: 'basin-miranda-wave', venue_id: 'venue-de-mirandabad', name_nl: 'Golfslag- & Recreatiebad', basin_category: 'SUBTROPICAL_WAVE_RECREATION', is_default_basin: 1, is_indoor: 1, length_meters: 25, lanes_count: null, has_movable_floor: 0, water_treatment: 'SALT_ELECTROLYSIS', target_temp_celsius: 31.2, warm_water_day_note_nl: 'Heerlijk warm voor gezinnen' },
      { id: 'basin-miranda-50m', venue_id: 'venue-de-mirandabad', name_nl: '50m Wedstrijdbad', basin_category: 'COMPETITION_50M', is_default_basin: 0, is_indoor: 1, length_meters: 50, lanes_count: 8, has_movable_floor: 1, water_treatment: 'SALT_ELECTROLYSIS', target_temp_celsius: 27.8, warm_water_day_note_nl: 'Optimale sporttemperatuur' },
      { id: 'basin-miranda-toddler', venue_id: 'venue-de-mirandabad', name_nl: 'Peuter- & Kleuterbad', basin_category: 'TODDLER_POOL', is_default_basin: 0, is_indoor: 1, length_meters: 10, lanes_count: null, has_movable_floor: 0, water_treatment: 'SALT_ELECTROLYSIS', target_temp_celsius: 32.5, warm_water_day_note_nl: 'Extra behaaglijk voor de allerkleinsten' },
      { id: 'basin-oost-25m', venue_id: 'venue-sportfondsenbad-oost', name_nl: '25m Wedstrijdbad', basin_category: 'COMPETITION_25M', is_default_basin: 1, is_indoor: 1, length_meters: 25, lanes_count: 6, has_movable_floor: 1, water_treatment: 'TRADITIONAL_CHLORINE', target_temp_celsius: 28.5, warm_water_day_note_nl: null },
      { id: 'basin-sloter-50m', venue_id: 'venue-sloterparkbad', name_nl: '50m Binnenbad & Instructiebad', basin_category: 'COMPETITION_50M', is_default_basin: 1, is_indoor: 1, length_meters: 50, lanes_count: 8, has_movable_floor: 1, water_treatment: 'SALT_ELECTROLYSIS', target_temp_celsius: 29.0, warm_water_day_note_nl: null },
      { id: 'basin-gaasperplas', venue_id: 'venue-gaasperplas', name_nl: 'Gaasperplas Zwemzone Noord', basin_category: 'NATURAL_OPEN_WATER', is_default_basin: 1, is_indoor: 0, length_meters: 400, lanes_count: null, has_movable_floor: 0, water_treatment: 'NATURAL_UNTREATED', target_temp_celsius: null, warm_water_day_note_nl: null },
    ];
    for (const b of basins) upsertBasin.run(b);

    // 6. Outdoor conditions for Gaasperplas
    db.prepare(`
      INSERT INTO outdoor_conditions (id, venue_id, source_authority, water_temp_celsius, water_quality_state, wetsuit_advice_nl, measured_at, is_current)
      VALUES ('cond-gaasperplas-current', 'venue-gaasperplas', 'RIJKSWATERSTAAT', 14.2, 'CLEAN_APPROVED', 'Wetsuit vereist (3-5mm) + zwemboei', '2026-10-21T08:00:00Z', 1)
      ON CONFLICT(id) DO UPDATE SET water_temp_celsius = excluded.water_temp_celsius
    `).run();

    // 7. Tariffs for De Mirandabad (SCD Type 2)
    const upsertTariff = db.prepare(`
      INSERT INTO tariffs (id, venue_id, tariff_category, title_nl, subtitle_nl, price_cents, unit_label_nl, visits_included, is_highlighted, badge_nl, tariff_year, valid_from, valid_to, is_current)
      VALUES (@id, @venue_id, @tariff_category, @title_nl, @subtitle_nl, @price_cents, @unit_label_nl, @visits_included, @is_highlighted, @badge_nl, 2026, '2026-01-01', NULL, 1)
      ON CONFLICT(id) DO UPDATE SET price_cents = excluded.price_cents
    `);
    const tariffs = [
      { id: 'tariff-miranda-adult', venue_id: 'venue-de-mirandabad', tariff_category: 'SINGLE_ADULT', title_nl: 'Losse entree Recreatief / Banen', subtitle_nl: 'Toegang tot golfslagbad, 50m bad en stoomcabines', price_cents: 820, unit_label_nl: 'per sessie', visits_included: 1, is_highlighted: 0, badge_nl: null },
      { id: 'tariff-miranda-child', venue_id: 'venue-de-mirandabad', tariff_category: 'SINGLE_CHILD', title_nl: 'Kind entree (t/m 12 jr)', subtitle_nl: 'Toegang tot alle binnenbaden', price_cents: 650, unit_label_nl: 'per sessie', visits_included: 1, is_highlighted: 0, badge_nl: null },
      { id: 'tariff-miranda-10pass', venue_id: 'venue-de-mirandabad', tariff_category: 'MULTI_PASS_10', title_nl: '10-Badenkaart (6 maanden geldig)', subtitle_nl: 'Voordelig zwemmen voor frequente bezoekers (€ 7,40 per bezoek)', price_cents: 7400, unit_label_nl: '6 maanden geldig', visits_included: 10, is_highlighted: 0, badge_nl: '10% besparing' },
      { id: 'tariff-miranda-monthly', venue_id: 'venue-de-mirandabad', tariff_category: 'MONTHLY_UNLIMITED_LANES', title_nl: 'Maandabonnement Onbeperkt Banenzwemmen', subtitle_nl: 'Onbeperkt toegang op vroege ochtenden en avonduren', price_cents: 4950, unit_label_nl: 'per maand', visits_included: null, is_highlighted: 0, badge_nl: null },
      { id: 'tariff-miranda-zwemles', venue_id: 'venue-de-mirandabad', tariff_category: 'ZWEMLES_MONTHLY_PACKAGE', title_nl: 'Zwemlespakket Diploma A', subtitle_nl: 'Wekelijks 45 min les, incl. diplomagarantie & gratis vrijzwemmen', price_cents: 6800, unit_label_nl: 'per maand', visits_included: null, is_highlighted: 1, badge_nl: 'Meest gekozen' },
    ];
    for (const t of tariffs) upsertTariff.run(t);

    // 8. Schedule Period & Slots for De Mirandabad
    db.prepare(`
      INSERT INTO schedule_periods (id, venue_id, schedule_type, title_nl, valid_from, valid_to, priority, verification_state, verified_at)
      VALUES ('sched-miranda-2026-reg', 'venue-de-mirandabad', 'REGULAR_WINTER', 'Regulier Rooster 2026', '2026-09-01', '2027-06-30', 10, 'VERIFIED_PUBLISHED', '2026-10-01T10:00:00Z')
      ON CONFLICT(id) DO NOTHING
    `).run();

    const upsertSlot = db.prepare(`
      INSERT INTO schedule_slots (id, schedule_period_id, basin_id, day_of_week, activity_type, label_nl, start_time, end_time, crowd_indication, notes_nl)
      VALUES (@id, 'sched-miranda-2026-reg', @basin_id, @day_of_week, @activity_type, @label_nl, @start_time, @end_time, @crowd_indication, @notes_nl)
      ON CONFLICT(id) DO NOTHING
    `);
    for (let day = 1; day <= 7; day++) {
      upsertSlot.run({
        id: `slot-miranda-early-${day}`,
        basin_id: 'basin-miranda-50m',
        day_of_week: day,
        activity_type: 'BANENZWEMMEN',
        label_nl: 'Vroege Vogel Banen',
        start_time: '07:00',
        end_time: '09:30',
        crowd_indication: 'QUIET',
        notes_nl: 'Snelle & trage banen ingedeeld',
      });
      upsertSlot.run({
        id: `slot-miranda-rec-${day}`,
        basin_id: 'basin-miranda-wave',
        day_of_week: day,
        activity_type: 'VRIJZWEMMEN_RECREATIEF',
        label_nl: 'Subtropisch & Golven',
        start_time: '10:00',
        end_time: '18:30',
        crowd_indication: 'MODERATE',
        notes_nl: 'Elk heel uur golfslag',
      });
      upsertSlot.run({
        id: `slot-miranda-evening-${day}`,
        basin_id: 'basin-miranda-50m',
        day_of_week: day,
        activity_type: 'BANENZWEMMEN',
        label_nl: 'Avond Banenzwemmen 50m',
        start_time: '19:00',
        end_time: '22:00',
        crowd_indication: 'QUIET',
        notes_nl: '8 banen geopend',
      });
    }

    // 9. Swim Providers & Offerings (Waitlists)
    db.prepare(`
      INSERT INTO swim_providers (id, slug, name, provider_type, is_nrz_licensed, methodology_nl, b2b_partner_state, official_registration_url)
      VALUES
        ('prov-miranda-gemeente', 'gemeente-amsterdam-mirandabad', 'Gemeente Amsterdam (De Mirandabad)', 'MUNICIPAL_OPERATOR', 1, 'NRZ Zwem-ABC', 'UNCLAIMED', 'https://www.amsterdam.nl/demirandabad/zwemles/'),
        ('prov-dolfijn', 'zwemschool-de-dolfijn', 'Zwemschool De Dolfijn', 'COMMERCIAL_SWIM_SCHOOL', 1, 'NRZ Zwem-ABC Kleine Groepen', 'UNCLAIMED', 'https://zwemschooldedolfijn.nl'),
        ('prov-oost', 'sportfondsen-oost-zwemles', 'Sportfondsenbad Oost Zwemles', 'MUNICIPAL_OPERATOR', 1, 'NRZ Zwem-ABC', 'UNCLAIMED', 'https://sportfondsenbadoost.nl/zwemles')
      ON CONFLICT(id) DO NOTHING
    `).run();

    db.prepare(`
      INSERT INTO venue_swim_offerings (id, venue_id, provider_id, diploma_track, monthly_price_cents, has_diploma_guarantee, group_max_size, lesson_duration_mins, current_waitlist_weeks_min, current_waitlist_weeks_max, direct_spots_note_nl, registration_url)
      VALUES
        ('off-miranda-a', 'venue-de-mirandabad', 'prov-miranda-gemeente', 'DIPLOMA_A', 6800, 1, 8, 45, 4, 6, 'Direct instromen mogelijk voor woensdagmiddag & zaterdagochtend (Nog 3 plekken)', 'https://www.amsterdam.nl/demirandabad/zwemles/'),
        ('off-dolfijn-a', 'venue-sloterparkbad', 'prov-dolfijn', 'DIPLOMA_A', 6450, 1, 6, 45, 6, 6, 'Kleine groepen in warm zoutwater', 'https://zwemschooldedolfijn.nl'),
        ('off-oost-a', 'venue-sportfondsenbad-oost', 'prov-oost', 'DIPLOMA_A', 6100, 0, 10, 45, 16, 20, 'Reguliere wachtlijst Amsterdam-Oost', 'https://sportfondsenbadoost.nl/zwemles')
      ON CONFLICT(id) DO UPDATE SET
        current_waitlist_weeks_min = excluded.current_waitlist_weeks_min,
        current_waitlist_weeks_max = excluded.current_waitlist_weeks_max
    `).run();

    // 10. Affiliate Product Stubs (Disabled by default per spec)
    db.prepare(`
      INSERT INTO affiliate_product_stubs (slug, context_rule, title_nl, target_url, is_enabled)
      VALUES
        ('neopreen-wetsuit-4mm', 'COLD_OPEN_WATER', 'Getest 4/3mm Open-Water Wetsuit', 'https://allezwembaden.nl/#wetsuit-stub', 0),
        ('anti-chloor-shampoo', 'CHLORINE_CARE', 'Verzorgende Anti-Chloor Shampoo', 'https://allezwembaden.nl/#shampoo-stub', 0)
      ON CONFLICT(slug) DO NOTHING
    `).run();
  });

  tx();
}
