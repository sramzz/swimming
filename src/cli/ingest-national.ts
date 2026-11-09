import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getBuildDatabase } from '../db/runtime-db';
import { haversineDistanceKm } from '../db/geo';
import { buildCuratedPhotosForVenue } from '../domain/venue-photos';

interface MunicipalityRecord {
  slug: string;
  cbs_code: string;
  name: string;
  province_slug: string;
  province_name: string;
  school_vacation_region: 'noord' | 'midden' | 'zuid';
  center_lat: number;
  center_lng: number;
}

interface CuratedPoolRecord {
  slug: string;
  municipality_slug: string;
  name: string;
  venue_type: string;
  street_address: string;
  postcode_pc6: string;
  postcode_pc4: string;
  neighborhood_name: string;
  lat: number;
  lng: number;
  operator_name: string;
  is_nrz_licensed: number;
  is_knzb_affiliated: number;
  municipal_keurmerk_label: string | null;
  primary_water_treatment: 'SALT_ELECTROLYSIS' | 'TRADITIONAL_CHLORINE' | 'UV_LOW_CHLORINE' | 'NATURAL_UNTREATED';
  has_wheelchair_lift: number;
  has_accessible_changing: number;
  parking_info_nl: string | null;
  ev_chargers_count: number;
  municipal_pass_name?: string | null;
  municipal_pass_discount_nl?: string | null;
  google_maps_embed_url: string;
  google_maps_route_url: string;
  official_website_url: string;
  official_tickets_url?: string | null;
  rating_score: number;
  rating_count: number;
  min_single_price_cents: number;
  featured_badge_nl?: string | null;
  basins?: Array<{
    name_nl: string;
    basin_category: string;
    is_default_basin: number;
    is_indoor: number;
    length_meters?: number;
    lanes_count?: number;
    target_temp_celsius?: number;
    water_treatment?: string;
  }>;
  tariffs?: Array<{
    tariff_category: string;
    title_nl: string;
    price_cents: number;
    unit_label_nl: string;
  }>;
  slots?: Array<{
    day_of_week: number;
    activity_type: string;
    label_nl: string;
    start_time: string;
    end_time: string;
  }>;
}

interface ZwemwaterSpot {
  spotid: string;
  locationid: string;
  status: string;
  coordinates: [number, number];
  name: string;
}

interface ZwemwaterDetailRecord {
  spotid: number;
  statusTextNl: string | null;
  recentMeasurementStatusNl: string | null;
  entranceFeeCode: string | null;
  isPaidAccess: boolean;
  waterQuality4YearClassNl: 'uitstekend' | 'goed' | 'aanvaardbaar' | 'slecht' | null;
  locationOwnerNl: string | null;
  descriptionNl: string | null;
  seasonTextNl: string | null;
  waterProfileUrl: string | null;
  infoBoardUrl: string | null;
  officialPhotoUrls: string[];
  featuresNl: string[];
  restrictionsNl: string[];
  warnings: Array<{ titleNl: string; bodyNl: string }>;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanVenueName(raw: string): string {
  let name = raw.replace(/^[`'‘]([A-Za-z])/, "'$1").trim();
  if (name.startsWith("'T ")) {
    name = "'t " + name.slice(3);
  } else if (name.startsWith("'S-")) {
    name = "'s-" + name.slice(3);
  }
  return name;
}

export async function runNationalIngestion(): Promise<{
  totalVenues: number;
  outdoorVenues: number;
  indoorVenues: number;
  municipalitiesCovered: number;
}> {
  console.log('🏊 Starting Zwemkaart.nl National Venue Ingestion (500+ Dutch Pools)...');
  const runId = `run-${Date.now()}`;
  const db = getBuildDatabase();

  // 1. Load Dutch Municipalities
  const municipalitiesPath = path.resolve(process.cwd(), 'src/data/dutch-municipalities.json');
  if (!fs.existsSync(municipalitiesPath)) {
    throw new Error(`Missing ${municipalitiesPath}`);
  }
  const municipalities: MunicipalityRecord[] = JSON.parse(
    fs.readFileSync(municipalitiesPath, 'utf-8')
  );

  console.log(`📍 Upserting ${municipalities.length} Dutch municipalities into database...`);
  const upsertMun = db.prepare(`
    INSERT INTO municipalities (slug, cbs_code, name, province_slug, province_name, school_vacation_region, center_lat, center_lng)
    VALUES (@slug, @cbs_code, @name, @province_slug, @province_name, @school_vacation_region, @center_lat, @center_lng)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      province_slug = excluded.province_slug,
      province_name = excluded.province_name,
      school_vacation_region = excluded.school_vacation_region,
      center_lat = excluded.center_lat,
      center_lng = excluded.center_lng
  `);

  const munBySlug = new Map<string, MunicipalityRecord>();
  const munByNameLower = new Map<string, MunicipalityRecord>();
  db.transaction(() => {
    for (const m of municipalities) {
      upsertMun.run(m);
      munBySlug.set(m.slug, m);
      munByNameLower.set(m.name.toLowerCase(), m);
    }
  })();

  // 2. Identify existing Gold Standard flagships to protect
  const goldStandardRows = db
    .prepare("SELECT id, slug, municipality_slug FROM venues WHERE enrichment_tier = 'GOLD_STANDARD'")
    .all() as Array<{ id: string; slug: string; municipality_slug: string }>;
  const protectedVenueKeys = new Set(goldStandardRows.map((v) => `${v.municipality_slug}:${v.slug}`));
  console.log(`🛡️  Preserving ${goldStandardRows.length} existing GOLD_STANDARD flagship venues.`);

  // 3. Upsert Generic Swim Providers
  db.prepare(`
    INSERT INTO swim_providers (id, slug, name, provider_type, is_nrz_licensed, methodology_nl, b2b_partner_state)
    VALUES
      ('prov-optisport-nl', 'optisport-zwemles', 'Optisport Zwemles', 'COMMERCIAL_SWIM_SCHOOL', 1, 'Optisport Zed & Sop Zwemles', 'UNCLAIMED'),
      ('prov-sportfondsen-nl', 'sportfondsen-zwemles', 'Sportfondsen Zwem-ABC', 'COMMERCIAL_SWIM_SCHOOL', 1, 'NRZ Zwem-ABC', 'UNCLAIMED'),
      ('prov-gemeente-sport', 'gemeentelijk-sportbedrijf', 'Gemeentelijk Sportbedrijf', 'MUNICIPAL_OPERATOR', 1, 'NRZ Zwem-ABC', 'UNCLAIMED'),
      ('prov-laco-nl', 'laco-zwemles', 'Laco Zwemles', 'COMMERCIAL_SWIM_SCHOOL', 1, 'Laco Zwemlesplan', 'UNCLAIMED')
    ON CONFLICT(id) DO NOTHING
  `).run();

  // 4. Ingest Curated Flagship Pools
  const curatedPoolsPath = path.resolve(process.cwd(), 'src/data/curated-pools.json');
  let curatedPools: CuratedPoolRecord[] = [];
  if (fs.existsSync(curatedPoolsPath)) {
    curatedPools = JSON.parse(fs.readFileSync(curatedPoolsPath, 'utf-8'));
  }

  const upsertPc4 = db.prepare(`
    INSERT INTO postcode_pc4 (pc4, municipality_slug, lat, lng)
    VALUES (@pc4, @municipality_slug, @lat, @lng)
    ON CONFLICT(pc4) DO UPDATE SET lat = excluded.lat, lng = excluded.lng
  `);

  const upsertVenue = db.prepare(`
    INSERT INTO venues (
      id, slug, municipality_slug, name, venue_type, enrichment_tier, operational_state,
      street_address, postcode_pc6, postcode_pc4, neighborhood_name, lat, lng,
      operator_name, is_nrz_licensed, is_knzb_affiliated, municipal_keurmerk_label,
      primary_water_treatment, has_wheelchair_lift, has_accessible_changing,
      parking_info_nl, ev_chargers_count, transit_chips_json,
      municipal_pass_name, municipal_pass_discount_nl,
      google_maps_embed_url, google_maps_route_url, official_website_url, official_tickets_url,
      rating_score, rating_count, min_single_price_cents, featured_badge_nl, hero_photos_json, zwemwater_metadata_json, content_hash
    ) VALUES (
      @id, @slug, @municipality_slug, @name, @venue_type, @enrichment_tier, @operational_state,
      @street_address, @postcode_pc6, @postcode_pc4, @neighborhood_name, @lat, @lng,
      @operator_name, @is_nrz_licensed, @is_knzb_affiliated, @municipal_keurmerk_label,
      @primary_water_treatment, @has_wheelchair_lift, @has_accessible_changing,
      @parking_info_nl, @ev_chargers_count, @transit_chips_json,
      @municipal_pass_name, @municipal_pass_discount_nl,
      @google_maps_embed_url, @google_maps_route_url, @official_website_url, @official_tickets_url,
      @rating_score, @rating_count, @min_single_price_cents, @featured_badge_nl, @hero_photos_json, @zwemwater_metadata_json, @content_hash
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      operator_name = excluded.operator_name,
      rating_score = excluded.rating_score,
      rating_count = excluded.rating_count,
      min_single_price_cents = excluded.min_single_price_cents,
      operational_state = excluded.operational_state,
      hero_photos_json = excluded.hero_photos_json,
      zwemwater_metadata_json = excluded.zwemwater_metadata_json
  `);

  const upsertBasin = db.prepare(`
    INSERT INTO basins (
      id, venue_id, name_nl, basin_category, is_default_basin, is_indoor,
      length_meters, lanes_count, water_treatment, target_temp_celsius
    ) VALUES (
      @id, @venue_id, @name_nl, @basin_category, @is_default_basin, @is_indoor,
      @length_meters, @lanes_count, @water_treatment, @target_temp_celsius
    )
    ON CONFLICT(id) DO UPDATE SET
      name_nl = excluded.name_nl,
      target_temp_celsius = excluded.target_temp_celsius
  `);

  const upsertTariff = db.prepare(`
    INSERT INTO tariffs (
      id, venue_id, tariff_category, title_nl, price_cents, unit_label_nl,
      tariff_year, valid_from, is_current
    ) VALUES (
      @id, @venue_id, @tariff_category, @title_nl, @price_cents, @unit_label_nl,
      2026, '2026-01-01', 1
    )
    ON CONFLICT(id) DO UPDATE SET price_cents = excluded.price_cents
  `);

  const upsertPeriod = db.prepare(`
    INSERT INTO schedule_periods (
      id, venue_id, schedule_type, title_nl, valid_from, valid_to, priority, verification_state
    ) VALUES (
      @id, @venue_id, 'REGULAR_WINTER', 'Regulier Rooster 2026', '2026-01-01', '2026-12-31', 10, 'CONFIRMED_REGULAR'
    )
    ON CONFLICT(id) DO NOTHING
  `);

  const upsertSlot = db.prepare(`
    INSERT INTO schedule_slots (
      id, schedule_period_id, day_of_week, activity_type, label_nl, start_time, end_time
    ) VALUES (
      @id, @schedule_period_id, @day_of_week, @activity_type, @label_nl, @start_time, @end_time
    )
    ON CONFLICT(id) DO NOTHING
  `);

  const upsertOffering = db.prepare(`
    INSERT INTO venue_swim_offerings (
      id, venue_id, provider_id, diploma_track, monthly_price_cents, has_diploma_guarantee,
      group_max_size, lesson_duration_mins, current_waitlist_weeks_min, current_waitlist_weeks_max,
      direct_spots_note_nl
    ) VALUES (
      @id, @venue_id, @provider_id, @diploma_track, @monthly_price_cents, @has_diploma_guarantee,
      @group_max_size, @lesson_duration_mins, @current_waitlist_weeks_min, @current_waitlist_weeks_max,
      @direct_spots_note_nl
    )
    ON CONFLICT(venue_id, provider_id, diploma_track) DO UPDATE SET
      monthly_price_cents = excluded.monthly_price_cents,
      current_waitlist_weeks_min = excluded.current_waitlist_weeks_min,
      current_waitlist_weeks_max = excluded.current_waitlist_weeks_max
  `);

  const upsertOutdoorCond = db.prepare(`
    INSERT INTO outdoor_conditions (
      id, venue_id, source_authority, water_temp_celsius, water_quality_state,
      wetsuit_advice_nl, measured_at, is_current
    ) VALUES (
      @id, @venue_id, 'ZWEMWATER_NL', NULL, @water_quality_state,
      @wetsuit_advice_nl, @measured_at, 1
    )
    ON CONFLICT(id) DO UPDATE SET
      water_quality_state = excluded.water_quality_state,
      wetsuit_advice_nl = excluded.wetsuit_advice_nl,
      measured_at = excluded.measured_at
  `);

  let indoorCount = 0;
  console.log(`🏊 Processing ${curatedPools.length} curated municipal & indoor pool complexes...`);
  db.transaction(() => {
    for (const pool of curatedPools) {
      const key = `${pool.municipality_slug}:${pool.slug}`;
      if (protectedVenueKeys.has(key)) {
        continue;
      }
      if (!munBySlug.has(pool.municipality_slug)) {
        console.warn(`Skipping pool with unknown municipality: ${pool.municipality_slug}`);
        continue;
      }

      // Upsert PC4 if valid
      if (pool.postcode_pc4 && pool.postcode_pc4.length === 4) {
        upsertPc4.run({
          pc4: pool.postcode_pc4,
          municipality_slug: pool.municipality_slug,
          lat: pool.lat,
          lng: pool.lng,
        });
      }

      const venueId = `venue-${pool.slug}`;
      const contentHash = crypto
        .createHash('sha256')
        .update(`${pool.name}:${pool.lat}:${pool.lng}:${pool.min_single_price_cents}`)
        .digest('hex');

      upsertVenue.run({
        id: venueId,
        slug: pool.slug,
        municipality_slug: pool.municipality_slug,
        name: pool.name,
        venue_type: pool.venue_type,
        enrichment_tier: 'BASELINE',
        operational_state: 'OPEN_REGULAR',
        street_address: pool.street_address,
        postcode_pc6: pool.postcode_pc6,
        postcode_pc4: pool.postcode_pc4,
        neighborhood_name: pool.neighborhood_name,
        lat: pool.lat,
        lng: pool.lng,
        operator_name: pool.operator_name,
        is_nrz_licensed: pool.is_nrz_licensed,
        is_knzb_affiliated: pool.is_knzb_affiliated,
        municipal_keurmerk_label: pool.municipal_keurmerk_label,
        primary_water_treatment: pool.primary_water_treatment,
        has_wheelchair_lift: pool.has_wheelchair_lift,
        has_accessible_changing: pool.has_accessible_changing,
        parking_info_nl: pool.parking_info_nl,
        ev_chargers_count: pool.ev_chargers_count,
        transit_chips_json: '[]',
        municipal_pass_name: pool.municipal_pass_name ?? null,
        municipal_pass_discount_nl: pool.municipal_pass_discount_nl ?? null,
        google_maps_embed_url: pool.google_maps_embed_url,
        google_maps_route_url: pool.google_maps_route_url,
        official_website_url: pool.official_website_url,
        official_tickets_url: pool.official_tickets_url ?? null,
        rating_score: pool.rating_score,
        rating_count: pool.rating_count,
        min_single_price_cents: pool.min_single_price_cents,
        featured_badge_nl: pool.featured_badge_nl ?? null,
        hero_photos_json: JSON.stringify(
          buildCuratedPhotosForVenue({
            slug: pool.slug,
            name: pool.name,
            venueType: pool.venue_type,
          })
        ),
        zwemwater_metadata_json: null,
        content_hash: contentHash,
      });

      // Basins
      if (pool.basins && pool.basins.length > 0) {
        for (let i = 0; i < pool.basins.length; i++) {
          const b = pool.basins[i];
          upsertBasin.run({
            id: `basin-${pool.slug}-${i}`,
            venue_id: venueId,
            name_nl: b.name_nl,
            basin_category: b.basin_category,
            is_default_basin: b.is_default_basin,
            is_indoor: b.is_indoor,
            length_meters: b.length_meters ?? null,
            lanes_count: b.lanes_count ?? null,
            water_treatment: b.water_treatment ?? pool.primary_water_treatment,
            target_temp_celsius: b.target_temp_celsius ?? 28.0,
          });
        }
      } else {
        upsertBasin.run({
          id: `basin-${pool.slug}-0`,
          venue_id: venueId,
          name_nl: '25m Bassin',
          basin_category: 'COMPETITION_25M',
          is_default_basin: 1,
          is_indoor: 1,
          length_meters: 25,
          lanes_count: 6,
          water_treatment: pool.primary_water_treatment,
          target_temp_celsius: 28.0,
        });
      }

      // Tariffs
      if (pool.tariffs && pool.tariffs.length > 0) {
        for (let i = 0; i < pool.tariffs.length; i++) {
          const t = pool.tariffs[i];
          upsertTariff.run({
            id: `tariff-${pool.slug}-${i}`,
            venue_id: venueId,
            tariff_category: t.tariff_category,
            title_nl: t.title_nl,
            price_cents: t.price_cents,
            unit_label_nl: t.unit_label_nl,
          });
        }
      }

      // Schedule Period & Slots
      if (pool.slots && pool.slots.length > 0) {
        const periodId = `period-${pool.slug}-winter`;
        upsertPeriod.run({ id: periodId, venue_id: venueId });
        for (let i = 0; i < pool.slots.length; i++) {
          const s = pool.slots[i];
          upsertSlot.run({
            id: `slot-${pool.slug}-${i}`,
            schedule_period_id: periodId,
            day_of_week: s.day_of_week,
            activity_type: s.activity_type,
            label_nl: s.label_nl,
            start_time: s.start_time,
            end_time: s.end_time,
          });
        }
      }

      // Swim offerings
      const providerId = pool.operator_name.toLowerCase().includes('optisport')
        ? 'prov-optisport-nl'
        : pool.operator_name.toLowerCase().includes('sportfondsen')
          ? 'prov-sportfondsen-nl'
          : pool.operator_name.toLowerCase().includes('laco')
            ? 'prov-laco-nl'
            : 'prov-gemeente-sport';

      upsertOffering.run({
        id: `offering-${pool.slug}-diploma-a`,
        venue_id: venueId,
        provider_id: providerId,
        diploma_track: 'DIPLOMA_A',
        monthly_price_cents: 6800,
        has_diploma_guarantee: 1,
        group_max_size: 8,
        lesson_duration_mins: 45,
        current_waitlist_weeks_min: 6,
        current_waitlist_weeks_max: 14,
        direct_spots_note_nl: 'Direct instromen mogelijk op doordeweekse ochtenden',
      });

      indoorCount++;
    }
  })();
  console.log(`✅ Ingested ${indoorCount} curated municipal/indoor pool venues.`);

  // 5. Ingest Zwemwater.nl Official Outdoor Bathing Spots
  console.log('🌊 Loading 945 official Dutch outdoor swimming locations and Rijkswaterstaat details from Zwemwater.nl...');
  let spots: ZwemwaterSpot[] = [];
  const addressBySpotId = new Map<string, string>();
  const detailBySpotId = new Map<string, ZwemwaterDetailRecord>();

  const fallbackSpotsPath = path.resolve(process.cwd(), 'src/data/zwemwater-spots.json');
  if (fs.existsSync(fallbackSpotsPath)) {
    const cached = JSON.parse(fs.readFileSync(fallbackSpotsPath, 'utf-8'));
    spots = cached.spots || [];
    for (const [k, v] of Object.entries(cached.addresses || {})) {
      addressBySpotId.set(k, v as string);
    }
    for (const [k, v] of Object.entries(cached.details || {})) {
      detailBySpotId.set(k, v as ZwemwaterDetailRecord);
    }
    console.log(
      `Loaded ${spots.length} spots and ${detailBySpotId.size} detailed Rijkswaterstaat dossiers from zwemwater-spots.json.`
    );
  }

  // Track slugs per municipality to ensure uniqueness
  const existingSlugsInMun = new Map<string, Set<string>>();
  const allExistingVenues = db
    .prepare('SELECT slug, municipality_slug FROM venues')
    .all() as Array<{ slug: string; municipality_slug: string }>;
  for (const v of allExistingVenues) {
    if (!existingSlugsInMun.has(v.municipality_slug)) {
      existingSlugsInMun.set(v.municipality_slug, new Set());
    }
    existingSlugsInMun.get(v.municipality_slug)!.add(v.slug);
  }

  let outdoorCount = 0;
  const nowIso = new Date().toISOString();

  db.transaction(() => {
    for (const spot of spots) {
      const [lat, lng] = spot.coordinates;
      // Sanity bounds check for Netherlands: 50.7 <= lat <= 53.8, 3.3 <= lng <= 7.3
      if (lat < 50.7 || lat > 53.8 || lng < 3.3 || lng > 7.3) {
        console.warn(`Skipping out-of-bounds spot ${spot.spotid}: ${spot.name} (${lat}, ${lng})`);
        continue;
      }

      const addressText = addressBySpotId.get(String(spot.spotid)) ?? '';
      let matchedMun: MunicipalityRecord | null = null;

      // Try matching town name from address: "Hoofdstraat , Schoonloo"
      if (addressText.includes(',')) {
        const parts = addressText.split(',').map((p) => p.trim());
        const town = parts[1] || parts[0];
        const townLower = town.toLowerCase();
        if (munByNameLower.has(townLower)) {
          matchedMun = munByNameLower.get(townLower)!;
        } else {
          const townSlug = slugify(town);
          if (munBySlug.has(townSlug)) {
            matchedMun = munBySlug.get(townSlug)!;
          }
        }
      }

      // If no address match, find closest municipality by centroid
      if (!matchedMun) {
        let minDist = Infinity;
        for (const m of municipalities) {
          const d = haversineDistanceKm(lat, lng, m.center_lat, m.center_lng);
          if (d < minDist) {
            minDist = d;
            matchedMun = m;
          }
        }
      }

      if (!matchedMun) {
        console.warn(`Could not match spot ${spot.spotid} to a municipality.`);
        continue;
      }

      const cleanName = cleanVenueName(spot.name);
      let baseSlug = slugify(cleanName);
      if (!baseSlug) baseSlug = `zwemplek-${spot.spotid}`;

      // Check if this venue is already a protected Gold Standard venue (e.g. gaasperplas in amsterdam)
      const protectedKey = `${matchedMun.slug}:${baseSlug}`;
      if (protectedVenueKeys.has(protectedKey)) {
        continue;
      }

      // Ensure unique slug within this municipality
      const munSlugs = existingSlugsInMun.get(matchedMun.slug) ?? new Set<string>();
      let uniqueSlug = baseSlug;
      if (munSlugs.has(uniqueSlug)) {
        uniqueSlug = `${baseSlug}-${spot.spotid}`;
      }
      munSlugs.add(uniqueSlug);
      existingSlugsInMun.set(matchedMun.slug, munSlugs);

      // Map status
      let operationalState = 'OPEN_REGULAR';
      let waterQualityState = 'CLEAN_APPROVED';
      let badgeNl = 'Officiële Zwemplek';
      let wetsuitAdviceNl = 'Natuurwater gecontroleerd door Rijkswaterstaat / Waterschap';

      const detail = detailBySpotId.get(String(spot.spotid)) ?? null;
      const isPaidAccess = detail?.isPaidAccess ?? false;
      const operatorName = detail?.locationOwnerNl
        ? detail.locationOwnerNl.split(',')[0].trim()
        : 'Rijkswaterstaat / Waterschap';

      if (spot.status === 'WAARSCHUWING' || spot.status === 'NADER_ONDERZOEK') {
        operationalState = 'WARNING_WATER_QUALITY';
        waterQualityState = 'WARNING_BLAUWALG';
        badgeNl = 'Waarschuwing Blauwalg';
        wetsuitAdviceNl =
          detail?.warnings?.[0]?.bodyNl || 'Waarschuwing blauwalg of verhoogd risico actief';
      } else if (spot.status === 'NEGATIEF_ZWEMADVIES') {
        operationalState = 'WARNING_WATER_QUALITY';
        waterQualityState = 'NEGATIVE_SWIM_ADVICE';
        badgeNl = 'Negatief Zwemadvies';
        wetsuitAdviceNl = detail?.warnings?.[0]?.bodyNl || 'Negatief zwemadvies van kracht';
      } else if (spot.status === 'ZWEMVERBOD') {
        operationalState = 'CLOSED_UNSAFE_OR_WEATHER';
        waterQualityState = 'SWIMMING_BAN';
        badgeNl = 'Zwemverbod';
        wetsuitAdviceNl =
          detail?.warnings?.[0]?.bodyNl || 'Zwemverbod van kracht vanwege waterkwaliteit of gevaar';
      }

      const venueId = `venue-zw-${spot.spotid}`;
      const contentHash = crypto
        .createHash('sha256')
        .update(`${cleanName}:${lat}:${lng}:${spot.status}:${isPaidAccess ? 'paid' : 'free'}`)
        .digest('hex');

      const embedUrl = `https://maps.google.com/maps?q=${lat},${lng}&hl=nl&z=14&output=embed`;
      const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      const websiteUrl = `https://www.zwemwater.nl/?id=${spot.spotid}`;

      upsertVenue.run({
        id: venueId,
        slug: uniqueSlug,
        municipality_slug: matchedMun.slug,
        name: cleanName,
        venue_type: 'OPEN_WATER_NATURAL',
        enrichment_tier: 'BASELINE',
        operational_state: operationalState,
        street_address: addressText || null,
        postcode_pc6: null,
        postcode_pc4: null,
        neighborhood_name: matchedMun.name,
        lat,
        lng,
        operator_name: operatorName,
        is_nrz_licensed: 0,
        is_knzb_affiliated: 0,
        municipal_keurmerk_label: detail?.waterQuality4YearClassNl
          ? `EU Waterkwaliteit: ${detail.waterQuality4YearClassNl}`
          : 'Officiële Zwemwaterlocatie',
        primary_water_treatment: 'NATURAL_UNTREATED',
        has_wheelchair_lift: 0,
        has_accessible_changing: 0,
        parking_info_nl: detail?.featuresNl?.some((f) => f.toLowerCase().includes('parkeer'))
          ? 'Parkeergelegenheid aanwezig bij zwemlocatie'
          : null,
        ev_chargers_count: 0,
        transit_chips_json: '[]',
        municipal_pass_name: null,
        municipal_pass_discount_nl: null,
        google_maps_embed_url: embedUrl,
        google_maps_route_url: routeUrl,
        official_website_url: websiteUrl,
        official_tickets_url: null,
        rating_score: null,
        rating_count: 0,
        min_single_price_cents: isPaidAccess ? null : 0,
        featured_badge_nl: badgeNl,
        hero_photos_json: JSON.stringify(
          buildCuratedPhotosForVenue({
            slug: uniqueSlug,
            name: cleanName,
            venueType: 'OPEN_WATER_NATURAL',
          })
        ),
        zwemwater_metadata_json: detail ? JSON.stringify(detail) : null,
        content_hash: contentHash,
      });

      // Default basin
      upsertBasin.run({
        id: `basin-zw-${spot.spotid}`,
        venue_id: venueId,
        name_nl: cleanName,
        basin_category: 'NATURAL_OPEN_WATER',
        is_default_basin: 1,
        is_indoor: 0,
        length_meters: null,
        lanes_count: null,
        water_treatment: 'NATURAL_UNTREATED',
        target_temp_celsius: null,
      });

      // Outdoor condition
      upsertOutdoorCond.run({
        id: `cond-zw-${spot.spotid}`,
        venue_id: venueId,
        water_quality_state: waterQualityState,
        wetsuit_advice_nl: wetsuitAdviceNl,
        measured_at: nowIso,
      });

      outdoorCount++;
    }
  })();

  console.log(`✅ Ingested ${outdoorCount} official outdoor swimming locations.`);

  // 6. Record Ingestion Run
  const totalVenuesRow = db.prepare('SELECT count(*) as count FROM venues').get() as { count: number };
  const munCountRow = db
    .prepare('SELECT count(DISTINCT municipality_slug) as count FROM venues')
    .get() as { count: number };

  db.prepare(`
    INSERT INTO ingestion_runs (
      run_id, runner_env, job_type, run_state, venues_checked, venues_updated, finished_at
    ) VALUES (
      @runId, 'LOCAL_MAC', 'NATIONAL_VENUE_SCALE', 'COMPLETED_CLEAN', @total, @updated, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    )
  `).run({
    runId,
    total: spots.length + curatedPools.length,
    updated: indoorCount + outdoorCount,
  });

  const breakdown = db
    .prepare('SELECT venue_type, count(*) as count FROM venues GROUP BY venue_type')
    .all() as Array<{ venue_type: string; count: number }>;

  console.log('\n================ INGESTION SUMMARY ================');
  console.log(`Total Venues in Database: ${totalVenuesRow.count}`);
  console.log(`Municipalities with active venues: ${munCountRow.count}`);
  console.log('Breakdown by Venue Type:');
  for (const b of breakdown) {
    console.log(` - ${b.venue_type}: ${b.count}`);
  }
  console.log('===================================================\n');

  db.close();

  return {
    totalVenues: totalVenuesRow.count,
    outdoorVenues: outdoorCount,
    indoorVenues: indoorCount,
    municipalitiesCovered: munCountRow.count,
  };
}

// Direct CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runNationalIngestion().catch((err) => {
    console.error('❌ Ingestion failed:', err);
    process.exit(1);
  });
}
