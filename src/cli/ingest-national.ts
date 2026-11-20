import fs from 'node:fs';
import path from 'node:path';
import { getBuildDatabase } from '../db/runtime-db';
import { applyDetailedSchema } from '../db/client';
import { seedInitialDataset } from '../db/seed';
import { haversineDistanceKm } from '../db/geo';
import { buildCuratedPhotosForVenue } from '../domain/venue-photos';
import {
  resolveDutchLocation,
  slugifyNl,
  type BagWoonplaatsRecord,
} from '../domain/dutch-geography';
import { evaluateScrapedVenueSanity, computeContentHash } from '../ingestion/sanity-gate';
import { createRunLogger } from '../lib/logger';
import { appendRunHistoryRow } from './verify-cf-profile';

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
  woonplaats_id?: string;
  woonplaats_slug?: string;
  woonplaats_name?: string;
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
  operational_state?: string;
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
  offerings?: Array<{
    diploma_track: string;
    monthly_price_cents?: number;
    has_diploma_guarantee?: number;
    group_max_size?: number;
    lesson_duration_mins?: number;
    current_waitlist_weeks_min?: number;
    current_waitlist_weeks_max?: number;
    direct_spots_note_nl?: string;
    registration_url?: string;
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

export function cleanVenueName(raw: string): string {
  let name = raw.replace(/^[`'‘]([A-Za-z])/, "'$1").trim();
  if (name.startsWith("'T ")) {
    name = "'t " + name.slice(3);
  } else if (name.startsWith("'S-")) {
    name = "'s-" + name.slice(3);
  }
  return name;
}

export function extractStreetPrefix(addressText: string | null | undefined, baseName: string): string | null {
  if (!addressText) return null;
  const beforeComma = addressText.split(',')[0].trim();
  const cleaned = beforeComma
    .replace(/\s+(z\.?n\.?|ong\.?)$/i, '')
    .trim();
  if (!cleaned) return null;
  if (cleaned.toLowerCase() === baseName.toLowerCase()) return null;
  return cleaned;
}

export interface DisambiguateSpotParams {
  name: string;
  spotid: string | number;
  addressText?: string | null;
  hasCollision?: boolean;
  isPrefixColliding?: boolean;
}

export function disambiguateZwemwaterName(params: DisambiguateSpotParams): string {
  const cleanName = cleanVenueName(params.name);
  if (!params.hasCollision) {
    return cleanName;
  }

  const streetPrefix = extractStreetPrefix(params.addressText, cleanName);

  if (streetPrefix && !params.isPrefixColliding) {
    return `${cleanName} (${streetPrefix})`;
  }

  if (streetPrefix && params.isPrefixColliding) {
    return `${cleanName} (${streetPrefix} - ${params.spotid})`;
  }

  return `${cleanName} (${params.spotid})`;
}

export function disambiguateMunicipalitySpots<T extends { spotid: string | number; name: string; addressText?: string | null }>(
  spots: T[],
  existingNamesInMunicipality?: Set<string> | string[]
): Array<T & { disambiguatedName: string }> {
  const existingSet = new Set(
    Array.isArray(existingNamesInMunicipality)
      ? existingNamesInMunicipality.map((n) => n.trim().toLowerCase())
      : Array.from(existingNamesInMunicipality ?? []).map((n) => n.trim().toLowerCase())
  );

  const nameCounts = new Map<string, number>();
  for (const s of spots) {
    const norm = cleanVenueName(s.name).toLowerCase();
    nameCounts.set(norm, (nameCounts.get(norm) ?? 0) + 1);
  }

  const prefixCandidates = spots.map((s) => {
    const cleanName = cleanVenueName(s.name);
    const hasCollision =
      (nameCounts.get(cleanName.toLowerCase()) ?? 0) > 1 || existingSet.has(cleanName.toLowerCase());
    if (!hasCollision) {
      return { spot: s, candidate: cleanName, hasCollision, streetPrefix: null };
    }
    const streetPrefix = extractStreetPrefix(s.addressText, cleanName);
    const candidate = streetPrefix ? `${cleanName} (${streetPrefix})` : `${cleanName} (${s.spotid})`;
    return { spot: s, candidate, hasCollision, streetPrefix };
  });

  const candidateCounts = new Map<string, number>();
  for (const item of prefixCandidates) {
    const norm = item.candidate.toLowerCase();
    candidateCounts.set(norm, (candidateCounts.get(norm) ?? 0) + 1);
  }

  return prefixCandidates.map((item) => {
    const cleanName = cleanVenueName(item.spot.name);
    if (!item.hasCollision) {
      return { ...item.spot, disambiguatedName: cleanName };
    }
    const count = candidateCounts.get(item.candidate.toLowerCase()) ?? 0;
    if (count > 1 || existingSet.has(item.candidate.toLowerCase())) {
      const finalName = item.streetPrefix
        ? `${cleanName} (${item.streetPrefix} - ${item.spot.spotid})`
        : `${cleanName} (${item.spot.spotid})`;
      return { ...item.spot, disambiguatedName: finalName };
    }
    return { ...item.spot, disambiguatedName: item.candidate };
  });
}

export async function runNationalIngestion(): Promise<{
  totalVenues: number;
  outdoorVenues: number;
  indoorVenues: number;
  municipalitiesCovered: number;
}> {
  const startedAt = new Date().toISOString();
  const runId = process.env.RUN_ID || `${startedAt.slice(0, 10)}_national_ingest`;
  const logger = createRunLogger({ runId });

  logger.info('INGEST_START', 'Starting Zwemkaart.nl National Venue Ingestion', { runId });
  console.log(`🏊 Starting Zwemkaart.nl National Venue Ingestion (Run: ${runId})...`);

  const db = getBuildDatabase();

  // 1. Ensure detailed schema & baseline seed (holidays, vacations, 6 Gold Standard flagships)
  applyDetailedSchema(db);
  seedInitialDataset(db);

  // 2. Load Dutch Municipalities (342 CBS rows)
  const municipalitiesPath = path.resolve(process.cwd(), 'src/data/dutch-municipalities.json');
  if (!fs.existsSync(municipalitiesPath)) {
    throw new Error(`Missing ${municipalitiesPath}`);
  }
  const municipalities: MunicipalityRecord[] = JSON.parse(
    fs.readFileSync(municipalitiesPath, 'utf-8')
  );

  logger.info('SEED_MUNICIPALITIES', `Upserting ${municipalities.length} Dutch municipalities into database`);
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
  db.transaction(() => {
    for (const m of municipalities) {
      upsertMun.run(m);
      munBySlug.set(m.slug, m);
    }
  })();

  // 3. Load & Upsert all 2,503 Dutch BAG Woonplaatsen & primary PC4 centroids
  const woonplaatsenPath = path.resolve(process.cwd(), 'src/data/dutch-woonplaatsen.json');
  if (!fs.existsSync(woonplaatsenPath)) {
    throw new Error(`Missing ${woonplaatsenPath}`);
  }
  const bagWoonplaatsen: BagWoonplaatsRecord[] = JSON.parse(
    fs.readFileSync(woonplaatsenPath, 'utf-8')
  );

  logger.info('SEED_WOONPLAATSEN', `Upserting ${bagWoonplaatsen.length} BAG woonplaatsen into database`);
  const upsertWpl = db.prepare(`
    INSERT INTO woonplaatsen (id, bag_id, slug, name, municipality_slug, province_slug, center_lat, center_lng)
    VALUES (@id, @bag_id, @slug, @name, @municipality_slug, @province_slug, @center_lat, @center_lng)
    ON CONFLICT(id) DO UPDATE SET
      bag_id = excluded.bag_id,
      slug = excluded.slug,
      name = excluded.name,
      municipality_slug = excluded.municipality_slug,
      province_slug = excluded.province_slug,
      center_lat = excluded.center_lat,
      center_lng = excluded.center_lng
  `);

  const upsertPc4 = db.prepare(`
    INSERT INTO postcode_pc4 (pc4, municipality_slug, woonplaats_id, lat, lng)
    VALUES (@pc4, @municipality_slug, @woonplaats_id, @lat, @lng)
    ON CONFLICT(pc4) DO UPDATE SET
      municipality_slug = excluded.municipality_slug,
      woonplaats_id = excluded.woonplaats_id,
      lat = excluded.lat,
      lng = excluded.lng
  `);

  db.transaction(() => {
    for (const w of bagWoonplaatsen) {
      upsertWpl.run(w);
      if (w.primary_pc4 && w.primary_pc4.length === 4) {
        upsertPc4.run({
          pc4: w.primary_pc4,
          municipality_slug: w.municipality_slug,
          woonplaats_id: w.id,
          lat: w.center_lat,
          lng: w.center_lng,
        });
      }
    }
  })();

  // 4. Backfill woonplaats for any GOLD_STANDARD flagship venue lacking woonplaats_id
  const goldStandardRows = db
    .prepare("SELECT id, slug, municipality_slug, street_address, lat, lng, woonplaats_id FROM venues WHERE enrichment_tier = 'GOLD_STANDARD'")
    .all() as Array<{
      id: string;
      slug: string;
      municipality_slug: string;
      street_address: string | null;
      lat: number;
      lng: number;
      woonplaats_id: string | null;
    }>;

  const updateGoldWpl = db.prepare(`
    UPDATE venues
    SET woonplaats_id = @woonplaats_id,
        woonplaats_slug = @woonplaats_slug,
        woonplaats_name = @woonplaats_name
    WHERE id = @id
  `);

  db.transaction(() => {
    for (const g of goldStandardRows) {
      if (!g.woonplaats_id) {
        const loc = resolveDutchLocation(
          { streetAddress: g.street_address, lat: g.lat, lng: g.lng },
          bagWoonplaatsen
        );
        updateGoldWpl.run({
          woonplaats_id: loc.woonplaatsId,
          woonplaats_slug: loc.woonplaatsSlug,
          woonplaats_name: loc.woonplaatsName,
          id: g.id,
        });
      }
    }
  })();

  const protectedVenueKeys = new Set(goldStandardRows.map((v) => `${v.municipality_slug}:${v.slug}`));
  const protectedVenueIds = new Set(goldStandardRows.map((v) => v.id));
  const activeVenueIds = new Set<string>(protectedVenueIds);
  logger.info('PROTECTED_GOLD', `Preserving ${goldStandardRows.length} existing GOLD_STANDARD flagship venues`);

  // 5. Upsert Swim Providers
  db.prepare(`
    INSERT INTO swim_providers (id, slug, name, provider_type, is_nrz_licensed, methodology_nl, b2b_partner_state)
    VALUES
      ('prov-optisport-nl', 'optisport-zwemles', 'Optisport Zwemles', 'COMMERCIAL_SWIM_SCHOOL', 1, 'Optisport Zed & Sop Zwemles', 'UNCLAIMED'),
      ('prov-sportfondsen-nl', 'sportfondsen-zwemles', 'Sportfondsen Zwem-ABC', 'COMMERCIAL_SWIM_SCHOOL', 1, 'NRZ Zwem-ABC', 'UNCLAIMED'),
      ('prov-gemeente-sport', 'gemeentelijk-sportbedrijf', 'Gemeentelijk Sportbedrijf', 'MUNICIPAL_OPERATOR', 1, 'NRZ Zwem-ABC', 'UNCLAIMED'),
      ('prov-laco-nl', 'laco-zwemles', 'Laco Zwemles', 'COMMERCIAL_SWIM_SCHOOL', 1, 'Laco Zwemlesplan', 'UNCLAIMED')
    ON CONFLICT(id) DO NOTHING
  `).run();

  // 6. Setup In-Memory Registry for UNIQUE(municipality_slug, slug) collision management
  const allExistingVenues = db
    .prepare('SELECT id, slug, municipality_slug, content_hash FROM venues')
    .all() as Array<{ id: string; slug: string; municipality_slug: string; content_hash: string | null }>;

  const existingHashByVenueId = new Map<string, string | null>();
  const venueByMunAndSlug = new Map<string, string>();
  const venueToMunSlugKey = new Map<string, string>();

  for (const v of allExistingVenues) {
    existingHashByVenueId.set(v.id, v.content_hash);
    const key = `${v.municipality_slug}:${v.slug}`;
    venueByMunAndSlug.set(key, v.id);
    venueToMunSlugKey.set(v.id, key);
  }

  // Prepared statements for 3-entity hierarchy & quarantine
  const upsertVenue = db.prepare(`
    INSERT INTO venues (
      id, slug, municipality_slug, name, venue_type, enrichment_tier, operational_state,
      street_address, postcode_pc6, postcode_pc4, woonplaats_id, woonplaats_slug, woonplaats_name, neighborhood_name,
      lat, lng, operator_name, is_nrz_licensed, is_knzb_affiliated, municipal_keurmerk_label,
      primary_water_treatment, has_wheelchair_lift, has_accessible_changing,
      parking_info_nl, ev_chargers_count, transit_chips_json,
      municipal_pass_name, municipal_pass_discount_nl,
      google_maps_embed_url, google_maps_route_url, official_website_url, official_tickets_url,
      rating_score, rating_count, min_single_price_cents, featured_badge_nl,
      hero_photos_json, zwemwater_metadata_json, content_hash
    ) VALUES (
      @id, @slug, @municipality_slug, @name, @venue_type, @enrichment_tier, @operational_state,
      @street_address, @postcode_pc6, @postcode_pc4, @woonplaats_id, @woonplaats_slug, @woonplaats_name, @neighborhood_name,
      @lat, @lng, @operator_name, @is_nrz_licensed, @is_knzb_affiliated, @municipal_keurmerk_label,
      @primary_water_treatment, @has_wheelchair_lift, @has_accessible_changing,
      @parking_info_nl, @ev_chargers_count, @transit_chips_json,
      @municipal_pass_name, @municipal_pass_discount_nl,
      @google_maps_embed_url, @google_maps_route_url, @official_website_url, @official_tickets_url,
      @rating_score, @rating_count, @min_single_price_cents, @featured_badge_nl,
      @hero_photos_json, @zwemwater_metadata_json, @content_hash
    )
    ON CONFLICT(id) DO UPDATE SET
      slug = excluded.slug,
      municipality_slug = excluded.municipality_slug,
      name = excluded.name,
      venue_type = excluded.venue_type,
      street_address = excluded.street_address,
      postcode_pc6 = excluded.postcode_pc6,
      postcode_pc4 = excluded.postcode_pc4,
      woonplaats_id = excluded.woonplaats_id,
      woonplaats_slug = excluded.woonplaats_slug,
      woonplaats_name = excluded.woonplaats_name,
      neighborhood_name = excluded.neighborhood_name,
      lat = excluded.lat,
      lng = excluded.lng,
      operator_name = excluded.operator_name,
      is_nrz_licensed = excluded.is_nrz_licensed,
      is_knzb_affiliated = excluded.is_knzb_affiliated,
      municipal_keurmerk_label = excluded.municipal_keurmerk_label,
      primary_water_treatment = excluded.primary_water_treatment,
      has_wheelchair_lift = excluded.has_wheelchair_lift,
      has_accessible_changing = excluded.has_accessible_changing,
      parking_info_nl = excluded.parking_info_nl,
      ev_chargers_count = excluded.ev_chargers_count,
      transit_chips_json = excluded.transit_chips_json,
      municipal_pass_name = excluded.municipal_pass_name,
      municipal_pass_discount_nl = excluded.municipal_pass_discount_nl,
      google_maps_embed_url = excluded.google_maps_embed_url,
      google_maps_route_url = excluded.google_maps_route_url,
      official_website_url = excluded.official_website_url,
      official_tickets_url = excluded.official_tickets_url,
      rating_score = excluded.rating_score,
      rating_count = excluded.rating_count,
      min_single_price_cents = excluded.min_single_price_cents,
      featured_badge_nl = excluded.featured_badge_nl,
      hero_photos_json = excluded.hero_photos_json,
      zwemwater_metadata_json = excluded.zwemwater_metadata_json,
      operational_state = excluded.operational_state,
      content_hash = excluded.content_hash,
      lastmod_at = CASE
        WHEN venues.content_hash IS NOT excluded.content_hash THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        ELSE venues.lastmod_at
      END
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
      basin_category = excluded.basin_category,
      is_default_basin = excluded.is_default_basin,
      is_indoor = excluded.is_indoor,
      length_meters = excluded.length_meters,
      lanes_count = excluded.lanes_count,
      water_treatment = excluded.water_treatment,
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
    ON CONFLICT(id) DO UPDATE SET
      tariff_category = excluded.tariff_category,
      title_nl = excluded.title_nl,
      price_cents = excluded.price_cents,
      unit_label_nl = excluded.unit_label_nl
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
    ON CONFLICT(id) DO UPDATE SET
      day_of_week = excluded.day_of_week,
      activity_type = excluded.activity_type,
      label_nl = excluded.label_nl,
      start_time = excluded.start_time,
      end_time = excluded.end_time
  `);

  const upsertOffering = db.prepare(`
    INSERT INTO venue_swim_offerings (
      id, venue_id, provider_id, diploma_track, monthly_price_cents, has_diploma_guarantee,
      group_max_size, lesson_duration_mins, current_waitlist_weeks_min, current_waitlist_weeks_max,
      direct_spots_note_nl, registration_url
    ) VALUES (
      @id, @venue_id, @provider_id, @diploma_track, @monthly_price_cents, @has_diploma_guarantee,
      @group_max_size, @lesson_duration_mins, @current_waitlist_weeks_min, @current_waitlist_weeks_max,
      @direct_spots_note_nl, @registration_url
    )
    ON CONFLICT(venue_id, provider_id, diploma_track) DO UPDATE SET
      monthly_price_cents = excluded.monthly_price_cents,
      has_diploma_guarantee = excluded.has_diploma_guarantee,
      group_max_size = excluded.group_max_size,
      lesson_duration_mins = excluded.lesson_duration_mins,
      current_waitlist_weeks_min = excluded.current_waitlist_weeks_min,
      current_waitlist_weeks_max = excluded.current_waitlist_weeks_max,
      direct_spots_note_nl = excluded.direct_spots_note_nl,
      registration_url = excluded.registration_url
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
      measured_at = CASE
        WHEN outdoor_conditions.water_quality_state IS NOT excluded.water_quality_state THEN excluded.measured_at
        ELSE outdoor_conditions.measured_at
      END
  `);

  const upsertAnomaly = db.prepare(`
    INSERT INTO quarantined_anomalies (
      id, run_id, venue_slug, failure_step, error_code, error_detail, local_fix_command, alert_state
    ) VALUES (
      @id, @run_id, @venue_slug, 'SANITY_INVARIANT', @error_code, @error_detail, @local_fix_command, 'ANOMALY_DETECTED'
    )
    ON CONFLICT(id) DO UPDATE SET
      error_code = excluded.error_code,
      error_detail = excluded.error_detail
  `);

  // 7. Ingest Curated Flagship Pools (690 pools)
  const curatedPoolsPath = path.resolve(process.cwd(), 'src/data/curated-pools.json');
  let curatedPools: CuratedPoolRecord[] = [];
  if (fs.existsSync(curatedPoolsPath)) {
    curatedPools = JSON.parse(fs.readFileSync(curatedPoolsPath, 'utf-8'));
  }

  let indoorCount = 0;
  let quarantinedCount = 0;
  let totalChecked = 0;
  let totalUpdated = 0;
  let totalUnchanged = 0;

  logger.info('PROCESS_CURATED', `Processing ${curatedPools.length} curated municipal & indoor pools`);
  console.log(`🏊 Processing ${curatedPools.length} curated municipal & indoor pool complexes...`);

  db.transaction(() => {
    for (const pool of curatedPools) {
      totalChecked++;
      const key = `${pool.municipality_slug}:${pool.slug}`;
      const venueId = `venue-${pool.slug}`;

      if (protectedVenueKeys.has(key) || protectedVenueIds.has(venueId)) {
        activeVenueIds.add(venueId);
        continue;
      }

      if (!munBySlug.has(pool.municipality_slug)) {
        logger.warn('UNKNOWN_MUN', `Skipping pool with unknown municipality: ${pool.municipality_slug}`, { slug: pool.slug });
        continue;
      }

      // Upsert pool's PC4 centroid if valid
      if (pool.postcode_pc4 && pool.postcode_pc4.length === 4) {
        upsertPc4.run({
          pc4: pool.postcode_pc4,
          municipality_slug: pool.municipality_slug,
          woonplaats_id: pool.woonplaats_id ?? null,
          lat: pool.lat,
          lng: pool.lng,
        });
      }

      // Canonical raw content payload for sanity check & diff hashing
      const rawContent = JSON.stringify({
        name: pool.name,
        municipality_slug: pool.municipality_slug,
        woonplaats_id: pool.woonplaats_id,
        street_address: pool.street_address,
        postcode_pc4: pool.postcode_pc4,
        lat: pool.lat,
        lng: pool.lng,
        min_single_price_cents: pool.min_single_price_cents,
        operational_state: pool.operational_state ?? 'OPEN_REGULAR',
        basins: pool.basins ?? [],
        tariffs: pool.tariffs ?? [],
        slots: pool.slots ?? [],
        offerings: pool.offerings ?? [],
      });

      const prevContentHash = existingHashByVenueId.get(venueId) ?? null;
      const sanityDecision = evaluateScrapedVenueSanity({
        venueSlug: pool.slug,
        isPaidPool: (pool.min_single_price_cents ?? 0) > 0,
        rawContent,
        previousContentHash: prevContentHash,
        previousSlotsCount: pool.slots?.length ?? 0,
        extractedAdultPriceCents: pool.min_single_price_cents ?? null,
        extractedSlotsCount: pool.slots?.length ?? 0,
      });

      if (sanityDecision.status === 'QUARANTINED_ANOMALY') {
        quarantinedCount++;
        logger.warn('SANITY_QUARANTINE', `Pool quarantined: ${pool.slug}`, {
          errorCode: sanityDecision.errorCode,
          errorDetail: sanityDecision.errorDetail,
        });
        upsertAnomaly.run({
          id: `anom-${runId}-${pool.slug}`,
          run_id: runId,
          venue_slug: pool.slug,
          error_code: sanityDecision.errorCode ?? 'SANITY_ANOMALY',
          error_detail: sanityDecision.errorDetail ?? 'Sanity check invariant failed',
          local_fix_command: sanityDecision.localFixCommand,
        });
        continue;
      }

      // Slug collision guard in case of (municipality_slug, slug) conflicts
      let uniqueSlug = pool.slug;
      const collisionId = venueByMunAndSlug.get(`${pool.municipality_slug}:${uniqueSlug}`);
      if (collisionId && collisionId !== venueId) {
        uniqueSlug = `${pool.slug}-pool`;
      }

      const oldKey = venueToMunSlugKey.get(venueId);
      if (oldKey) venueByMunAndSlug.delete(oldKey);
      const newKey = `${pool.municipality_slug}:${uniqueSlug}`;
      venueByMunAndSlug.set(newKey, venueId);
      venueToMunSlugKey.set(venueId, newKey);

      if (prevContentHash === sanityDecision.contentHash) {
        totalUnchanged++;
      } else {
        totalUpdated++;
      }
      existingHashByVenueId.set(venueId, sanityDecision.contentHash);

      upsertVenue.run({
        id: venueId,
        slug: uniqueSlug,
        municipality_slug: pool.municipality_slug,
        name: pool.name,
        venue_type: pool.venue_type,
        enrichment_tier: 'BASELINE',
        operational_state: pool.operational_state ?? 'OPEN_REGULAR',
        street_address: pool.street_address,
        postcode_pc6: pool.postcode_pc6,
        postcode_pc4: pool.postcode_pc4,
        woonplaats_id: pool.woonplaats_id ?? null,
        woonplaats_slug: pool.woonplaats_slug ?? null,
        woonplaats_name: pool.woonplaats_name ?? null,
        neighborhood_name: pool.neighborhood_name ?? pool.woonplaats_name,
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
            slug: uniqueSlug,
            name: pool.name,
            venueType: pool.venue_type,
          })
        ),
        zwemwater_metadata_json: null,
        content_hash: sanityDecision.contentHash,
      });
      activeVenueIds.add(venueId);

      // Basins (ensure >= 1 default basin)
      if (pool.basins && pool.basins.length > 0) {
        const hasDefault = pool.basins.some((b) => b.is_default_basin === 1);
        for (let i = 0; i < pool.basins.length; i++) {
          const b = pool.basins[i];
          const isDefault = hasDefault ? b.is_default_basin : i === 0 ? 1 : 0;
          upsertBasin.run({
            id: `basin-${pool.slug}-${i}`,
            venue_id: venueId,
            name_nl: b.name_nl,
            basin_category: b.basin_category,
            is_default_basin: isDefault,
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

      // Swim offerings (harvested or default DIPLOMA_A fallback)
      const providerId = pool.operator_name.toLowerCase().includes('optisport')
        ? 'prov-optisport-nl'
        : pool.operator_name.toLowerCase().includes('sportfondsen')
          ? 'prov-sportfondsen-nl'
          : pool.operator_name.toLowerCase().includes('laco')
            ? 'prov-laco-nl'
            : 'prov-gemeente-sport';

      if (pool.offerings && pool.offerings.length > 0) {
        for (let i = 0; i < pool.offerings.length; i++) {
          const o = pool.offerings[i];
          upsertOffering.run({
            id: `offering-${pool.slug}-${slugifyNl(o.diploma_track)}`,
            venue_id: venueId,
            provider_id: providerId,
            diploma_track: o.diploma_track,
            monthly_price_cents: o.monthly_price_cents ?? 6800,
            has_diploma_guarantee: o.has_diploma_guarantee ?? 1,
            group_max_size: o.group_max_size ?? 8,
            lesson_duration_mins: o.lesson_duration_mins ?? 45,
            current_waitlist_weeks_min: o.current_waitlist_weeks_min ?? 4,
            current_waitlist_weeks_max: o.current_waitlist_weeks_max ?? 12,
            direct_spots_note_nl: o.direct_spots_note_nl ?? 'Direct instromen mogelijk',
            registration_url: o.registration_url ?? null,
          });
        }
      } else {
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
          registration_url: null,
        });
      }

      indoorCount++;
    }
  })();
  logger.info('INGEST_POOLS_COMPLETE', `Ingested ${indoorCount} curated municipal/indoor pool venues`);
  console.log(`✅ Ingested ${indoorCount} curated municipal/indoor pool venues.`);

  // 8. Ingest Zwemwater.nl Official Outdoor Bathing Spots (945 spots)
  logger.info('PROCESS_ZWEMWATER', 'Loading 945 official Dutch outdoor swimming locations from Zwemwater.nl');
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
  }

  // Index curated pools by municipality for collision check
  const curatedByMun = new Map<string, CuratedPoolRecord[]>();
  for (const pool of curatedPools) {
    if (!curatedByMun.has(pool.municipality_slug)) {
      curatedByMun.set(pool.municipality_slug, []);
    }
    curatedByMun.get(pool.municipality_slug)!.push(pool);
  }

  interface ResolvedSpotItem {
    spot: ZwemwaterSpot;
    lat: number;
    lng: number;
    addressText: string;
    loc: ReturnType<typeof resolveDutchLocation>;
  }

  const validSpots: ResolvedSpotItem[] = [];
  for (const spot of spots) {
    totalChecked++;
    const [lat, lng] = spot.coordinates;
    // Sanity bounds check for Netherlands: 50.7 <= lat <= 53.8, 3.3 <= lng <= 7.3
    if (lat < 50.7 || lat > 53.8 || lng < 3.3 || lng > 7.3) {
      logger.warn('OUT_OF_BOUNDS_SPOT', `Skipping out-of-bounds spot ${spot.spotid}: ${spot.name} (${lat}, ${lng})`);
      continue;
    }

    const addressText = addressBySpotId.get(String(spot.spotid)) ?? '';
    const loc = resolveDutchLocation(
      { streetAddress: addressText, lat, lng },
      bagWoonplaatsen
    );
    validSpots.push({ spot, lat, lng, addressText, loc });
  }

  // Prevent open-water / curated-pool collision
  const nonCollidingSpots: ResolvedSpotItem[] = [];
  for (const item of validSpots) {
    const { spot, lat, lng, loc } = item;
    const cleanName = cleanVenueName(spot.name);
    let baseSlug = slugifyNl(cleanName);
    if (!baseSlug) baseSlug = `zwemplek-${spot.spotid}`;

    const munCurated = curatedByMun.get(loc.municipalitySlug) ?? [];
    let isColliding = false;

    for (const c of munCurated) {
      const sameSlug = c.slug === baseSlug || c.slug === `zwembad-${baseSlug}`;
      const sameName = c.name.toLowerCase() === cleanName.toLowerCase();
      const distKm = haversineDistanceKm(lat, lng, c.lat, c.lng);
      const distMeters = distKm * 1000;

      if ((sameSlug && sameName) || (sameName && distMeters < 150)) {
        isColliding = true;
        logger.info('COLLISION_SKIPPED', `Skipping duplicate zwemwater spot colliding with curated pool: ${cleanName} (${spot.spotid})`, {
          spotid: spot.spotid,
          curatedSlug: c.slug,
          municipality: loc.municipalitySlug,
          distanceMeters: Math.round(distMeters),
        });
        console.log(`⏩ Skipping duplicate zwemwater spot "${cleanName}" (spot ${spot.spotid}) colliding with curated pool "${c.name}" (${c.slug}) [${Math.round(distMeters)}m]`);
        break;
      }

      if (distMeters < 150) {
        logger.info('COLLISION_CHECK_COEXIST', `Zwemwater spot within 150m of curated pool (coexisting): ${cleanName} (${spot.spotid}) near ${c.name} [${Math.round(distMeters)}m]`);
      }
    }

    if (!isColliding) {
      nonCollidingSpots.push(item);
    }
  }

  // Disambiguate repeated zwemwater spot names within each municipality
  const spotsByMunicipality = new Map<string, Array<{ spotid: string; name: string; addressText: string; item: ResolvedSpotItem }>>();
  for (const item of nonCollidingSpots) {
    const mun = item.loc.municipalitySlug;
    if (!spotsByMunicipality.has(mun)) {
      spotsByMunicipality.set(mun, []);
    }
    spotsByMunicipality.get(mun)!.push({
      spotid: String(item.spot.spotid),
      name: item.spot.name,
      addressText: item.addressText,
      item,
    });
  }

  const disambiguatedSpots: Array<{ item: ResolvedSpotItem; disambiguatedName: string }> = [];
  for (const [mun, munSpots] of spotsByMunicipality.entries()) {
    const existingMunCuratedNames = (curatedByMun.get(mun) ?? []).map((c) => c.name);
    const res = disambiguateMunicipalitySpots(munSpots, existingMunCuratedNames);
    for (const r of res) {
      disambiguatedSpots.push({ item: r.item, disambiguatedName: r.disambiguatedName });
    }
  }

  let outdoorCount = 0;
  const nowIso = new Date().toISOString();

  db.transaction(() => {
    for (const { item, disambiguatedName } of disambiguatedSpots) {
      const { spot, lat, lng, addressText, loc } = item;

      // Ensure PC4 exists in postcode_pc4 before referencing in venues
      if (loc.postcodePc4 && loc.postcodePc4.length === 4) {
        upsertPc4.run({
          pc4: loc.postcodePc4,
          municipality_slug: loc.municipalitySlug,
          woonplaats_id: loc.woonplaatsId,
          lat,
          lng,
        });
      }

      const cleanName = disambiguatedName;
      let baseSlug = slugifyNl(cleanName);
      if (!baseSlug) baseSlug = `zwemplek-${spot.spotid}`;

      // Check if this venue is already a protected Gold Standard venue (e.g. gaasperplas-open-water)
      const protectedKey = `${loc.municipalitySlug}:${baseSlug}`;
      const venueId = `venue-zw-${spot.spotid}`;
      if (protectedVenueKeys.has(protectedKey) || protectedVenueIds.has(venueId)) {
        activeVenueIds.add(venueId);
        continue;
      }

      // Ensure unique slug within this municipality
      let uniqueSlug = baseSlug;
      const collisionId = venueByMunAndSlug.get(`${loc.municipalitySlug}:${uniqueSlug}`);
      if (collisionId && collisionId !== venueId) {
        uniqueSlug = `${baseSlug}-${spot.spotid}`;
        const secondCollisionId = venueByMunAndSlug.get(`${loc.municipalitySlug}:${uniqueSlug}`);
        if (secondCollisionId && secondCollisionId !== venueId) {
          uniqueSlug = `${baseSlug}-${spot.spotid}-spot`;
        }
      }

      const oldKey = venueToMunSlugKey.get(venueId);
      if (oldKey) venueByMunAndSlug.delete(oldKey);
      const newKey = `${loc.municipalitySlug}:${uniqueSlug}`;
      venueByMunAndSlug.set(newKey, venueId);
      venueToMunSlugKey.set(venueId, newKey);
      activeVenueIds.add(venueId);

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

      const rawContent = JSON.stringify({
        name: cleanName,
        municipality_slug: loc.municipalitySlug,
        woonplaats_id: loc.woonplaatsId,
        lat,
        lng,
        status: spot.status,
        operational_state: operationalState,
        isPaidAccess,
        operatorName,
        waterQualityState,
        detail: detail
          ? {
              class: detail.waterQuality4YearClassNl,
              features: detail.featuresNl,
              warnings: detail.warnings,
            }
          : null,
      });

      const contentHash = computeContentHash(rawContent);
      const prevContentHash = existingHashByVenueId.get(venueId) ?? null;
      if (prevContentHash === contentHash) {
        totalUnchanged++;
      } else {
        totalUpdated++;
      }
      existingHashByVenueId.set(venueId, contentHash);

      const embedUrl = `https://maps.google.com/maps?q=${lat},${lng}&hl=nl&z=14&output=embed`;
      const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      const websiteUrl = `https://www.zwemwater.nl/?id=${spot.spotid}`;

      upsertVenue.run({
        id: venueId,
        slug: uniqueSlug,
        municipality_slug: loc.municipalitySlug,
        name: cleanName,
        venue_type: 'OPEN_WATER_NATURAL',
        enrichment_tier: 'BASELINE',
        operational_state: operationalState,
        street_address: addressText || null,
        postcode_pc6: loc.postcodePc6,
        postcode_pc4: loc.postcodePc4,
        woonplaats_id: loc.woonplaatsId,
        woonplaats_slug: loc.woonplaatsSlug,
        woonplaats_name: loc.woonplaatsName,
        neighborhood_name: loc.woonplaatsName,
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

  logger.info('INGEST_ZWEMWATER_COMPLETE', `Ingested ${outdoorCount} official outdoor swimming locations`);
  console.log(`✅ Ingested ${outdoorCount} official outdoor swimming locations.`);

  // 9. Backfill default basins for any venues lacking a default basin (e.g. initial seeds)
  const venuesWithoutDefaultBasin = db
    .prepare(`
      SELECT id, name, venue_type, primary_water_treatment
      FROM venues v
      WHERE NOT EXISTS (
        SELECT 1 FROM basins b WHERE b.venue_id = v.id AND b.is_default_basin = 1
      )
    `)
    .all() as Array<{ id: string; name: string; venue_type: string; primary_water_treatment: string }>;

  db.transaction(() => {
    for (const v of venuesWithoutDefaultBasin) {
      const isOutdoor = v.venue_type === 'OPEN_WATER_NATURAL' || v.venue_type === 'OUTDOOR_SEASONAL_POOL';
      const basinCategory = v.venue_type === 'OPEN_WATER_NATURAL'
        ? 'NATURAL_OPEN_WATER'
        : v.venue_type === 'OUTDOOR_SEASONAL_POOL'
          ? 'OUTDOOR_HEATED_BASIN'
          : 'COMPETITION_25M';
      upsertBasin.run({
        id: `basin-${v.id}-default`,
        venue_id: v.id,
        name_nl: v.name.includes('Bassin') || v.name.includes('Bad') ? v.name : `${v.name} Bassin`,
        basin_category: basinCategory,
        is_default_basin: 1,
        is_indoor: isOutdoor ? 0 : 1,
        length_meters: isOutdoor ? null : 25,
        lanes_count: isOutdoor ? null : 6,
        water_treatment: v.primary_water_treatment,
        target_temp_celsius: isOutdoor ? null : 28.5,
      });
    }
  })();

  // 9b. Clean up stale/deleted venues not in the active set
  db.exec('CREATE TEMP TABLE IF NOT EXISTS active_venue_ids (id TEXT PRIMARY KEY)');
  const insActive = db.prepare('INSERT OR IGNORE INTO active_venue_ids (id) VALUES (?)');
  db.transaction(() => {
    for (const id of activeVenueIds) {
      insActive.run(id);
    }
  })();

  const staleVenues = db
    .prepare('SELECT id, slug, municipality_slug FROM venues WHERE id NOT IN (SELECT id FROM active_venue_ids)')
    .all() as Array<{ id: string; slug: string; municipality_slug: string }>;

  if (staleVenues.length > 0) {
    logger.info('STALE_VENUES_CLEANUP', `Cleaning up ${staleVenues.length} stale/deleted venues from database`, {
      count: staleVenues.length,
    });
    console.log(`🧹 Cleaning up ${staleVenues.length} stale/deleted venues...`);

    const existingTables = new Set(
      (
        db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{
          name: string;
        }>
      ).map((r) => r.name)
    );

    const childTables = [
      'pricing_rules',
      'schedules',
      'swimming_lessons',
      'pool_facilities',
      'water_quality_measurements',
      'crowd_reports',
      'outdoor_conditions',
      'basins',
      'tariffs',
      'schedule_periods',
      'venue_swim_offerings',
      'outbound_click_daily_counts',
    ];

    db.transaction(() => {
      for (const tbl of childTables) {
        if (existingTables.has(tbl)) {
          try {
            db.prepare(`DELETE FROM ${tbl} WHERE venue_id NOT IN (SELECT id FROM active_venue_ids)`).run();
          } catch {
            // Child table might have different schema or cascade handled automatically
          }
        }
      }
      db.prepare('DELETE FROM venues WHERE id NOT IN (SELECT id FROM active_venue_ids)').run();
    })();
  }
  db.exec('DROP TABLE IF EXISTS active_venue_ids');

  // 10. Record Ingestion Run in DB and run-history.md
  const totalVenuesRow = db.prepare('SELECT count(*) as count FROM venues').get() as { count: number };
  const munCountRow = db
    .prepare('SELECT count(DISTINCT municipality_slug) as count FROM venues')
    .get() as { count: number };

  const logFilePath = `logs/runs/${runId}.log`;
  const runState = quarantinedCount > 0 ? 'COMPLETED_WITH_QUARANTINES' : 'COMPLETED_CLEAN';

  db.prepare(`
    INSERT INTO ingestion_runs (
      run_id, runner_env, job_type, run_state,
      venues_checked, venues_updated, venues_unchanged, venues_quarantined,
      log_file_path, started_at, finished_at
    ) VALUES (
      @runId, 'LOCAL_MAC', 'NATIONAL_VENUE_SCALE', @runState,
      @venuesChecked, @venuesUpdated, @venuesUnchanged, @venuesQuarantined,
      @logFilePath, @startedAt, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    )
    ON CONFLICT(run_id) DO UPDATE SET
      run_state = excluded.run_state,
      venues_checked = excluded.venues_checked,
      venues_updated = excluded.venues_updated,
      venues_unchanged = excluded.venues_unchanged,
      venues_quarantined = excluded.venues_quarantined,
      finished_at = excluded.finished_at
  `).run({
    runId,
    runState,
    venuesChecked: totalChecked,
    venuesUpdated: totalUpdated,
    venuesUnchanged: totalUnchanged,
    venuesQuarantined: quarantinedCount,
    logFilePath,
    startedAt,
  });

  appendRunHistoryRow(path.resolve(process.cwd(), 'database-context/run-history.md'), {
    runId,
    timestampUtc: new Date().toISOString(),
    runner: 'LOCAL_MAC',
    jobType: 'NATIONAL_VENUE_SCALE',
    checked: totalChecked,
    updated: totalUpdated,
    quarantined: quarantinedCount,
    logFile: logFilePath,
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

  logger.info('INGEST_FINISH', 'National ingestion finished successfully', {
    totalVenues: totalVenuesRow.count,
    outdoorVenues: outdoorCount,
    indoorVenues: indoorCount,
    municipalitiesCovered: munCountRow.count,
    quarantinedCount,
  });

  db.close();

  return {
    totalVenues: totalVenuesRow.count,
    outdoorVenues: outdoorCount,
    indoorVenues: indoorCount,
    municipalitiesCovered: munCountRow.count,
  };
}

// Direct CLI execution
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}` && !process.env.VITEST) {
  runNationalIngestion().catch((err) => {
    console.error('❌ Ingestion failed:', err);
    process.exit(1);
  });
}
