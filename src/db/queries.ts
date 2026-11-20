import type { SqliteDatabase } from './client';
import { computeBoundingBox, haversineDistanceKm } from './geo';

export interface VenueRow {
  id: string;
  slug: string;
  municipality_slug: string;
  name: string;
  venue_type: string;
  enrichment_tier: string;
  operational_state: string;
  street_address: string | null;
  postcode_pc6: string | null;
  postcode_pc4: string | null;
  woonplaats_id?: string | null;
  woonplaats_slug?: string | null;
  woonplaats_name?: string | null;
  neighborhood_name: string | null;
  lat: number;
  lng: number;
  operator_name: string | null;
  is_nrz_licensed: number;
  is_knzb_affiliated: number;
  municipal_keurmerk_label: string | null;
  primary_water_treatment: 'SALT_ELECTROLYSIS' | 'TRADITIONAL_CHLORINE' | 'UV_LOW_CHLORINE' | 'NATURAL_UNTREATED';
  has_wheelchair_lift: number;
  has_accessible_changing: number;
  parking_info_nl: string | null;
  ev_chargers_count: number;
  transit_chips_json: string;
  municipal_pass_name: string | null;
  municipal_pass_discount_nl: string | null;
  google_maps_embed_url: string | null;
  google_maps_route_url: string | null;
  official_website_url: string | null;
  official_tickets_url: string | null;
  rating_score: number | null;
  rating_count: number;
  min_single_price_cents: number | null;
  featured_badge_nl: string | null;
  hero_photos_json?: string;
  zwemwater_metadata_json?: string | null;
  lastmod_at: string;
  default_temp_celsius?: number | null;
  default_basin_name_nl?: string | null;
  min_waitlist_weeks?: number | null;
  min_zwemles_monthly_cents?: number | null;
}

export interface BasinRow {
  id: string;
  venue_id: string;
  name_nl: string;
  basin_category: string;
  is_default_basin: number;
  is_indoor: number;
  length_meters: number | null;
  lanes_count: number | null;
  water_treatment: string;
  target_temp_celsius: number | null;
  warm_water_day_note_nl: string | null;
}

export interface TariffRow {
  id: string;
  venue_id: string;
  tariff_category: string;
  title_nl: string;
  subtitle_nl: string | null;
  price_cents: number;
  unit_label_nl: string;
  visits_included: number | null;
  is_highlighted: number;
  badge_nl: string | null;
}

export interface ScheduleSlotRow {
  id: string;
  day_of_week: number;
  activity_type: string;
  label_nl: string;
  start_time: string;
  end_time: string;
  crowd_indication: string | null;
  notes_nl: string | null;
}

export interface SwimOfferingRow {
  id: string;
  venue_id: string;
  venue_name: string;
  venue_slug: string;
  municipality_slug: string;
  provider_name: string;
  diploma_track: string;
  monthly_price_cents: number | null;
  has_diploma_guarantee: number;
  current_waitlist_weeks_min: number;
  current_waitlist_weeks_max: number;
  direct_spots_note_nl: string | null;
  registration_url: string | null;
  primary_water_treatment: string;
  distance_km?: number;
}

export interface VenueDetail extends VenueRow {
  basins: BasinRow[];
  tariffs: TariffRow[];
  slots: ScheduleSlotRow[];
  offerings: SwimOfferingRow[];
  outdoor_temp_celsius: number | null;
  wetsuit_advice_nl: string | null;
}

export function getVenueByCityAndSlug(
  db: SqliteDatabase,
  citySlug: string,
  venueSlug: string
): VenueDetail | null {
  const venue = db
    .prepare('SELECT * FROM venues WHERE municipality_slug = ? AND slug = ?')
    .get(citySlug, venueSlug) as VenueRow | undefined;

  if (!venue) return null;

  const basins = db
    .prepare('SELECT * FROM basins WHERE venue_id = ? ORDER BY is_default_basin DESC')
    .all(venue.id) as BasinRow[];

  const tariffs = db
    .prepare('SELECT * FROM tariffs WHERE venue_id = ? AND is_current = 1 ORDER BY price_cents ASC')
    .all(venue.id) as TariffRow[];

  const slots = db
    .prepare(
      `SELECT s.* FROM schedule_slots s
       JOIN schedule_periods p ON s.schedule_period_id = p.id
       WHERE p.venue_id = ?
       ORDER BY p.priority DESC, s.day_of_week ASC, s.start_time ASC`
    )
    .all(venue.id) as ScheduleSlotRow[];

  const offerings = db
    .prepare(
      `SELECT o.*, v.name AS venue_name, v.slug AS venue_slug, v.municipality_slug,
              v.primary_water_treatment, sp.name AS provider_name
       FROM venue_swim_offerings o
       JOIN venues v ON o.venue_id = v.id
       JOIN swim_providers sp ON o.provider_id = sp.id
       WHERE o.venue_id = ?`
    )
    .all(venue.id) as SwimOfferingRow[];

  const outdoor = db
    .prepare('SELECT water_temp_celsius, wetsuit_advice_nl FROM outdoor_conditions WHERE venue_id = ? AND is_current = 1')
    .get(venue.id) as { water_temp_celsius: number | null; wetsuit_advice_nl: string | null } | undefined;

  return {
    ...venue,
    basins,
    tariffs,
    slots,
    offerings,
    outdoor_temp_celsius: outdoor?.water_temp_celsius ?? null,
    wetsuit_advice_nl: outdoor?.wetsuit_advice_nl ?? null,
  };
}

const VENUE_ENRICHED_SELECT = `
  SELECT
    v.*,
    COALESCE(
      (SELECT b.target_temp_celsius FROM basins b WHERE b.venue_id = v.id AND b.is_default_basin = 1 LIMIT 1),
      (SELECT oc.water_temp_celsius FROM outdoor_conditions oc WHERE oc.venue_id = v.id AND oc.is_current = 1 LIMIT 1)
    ) AS default_temp_celsius,
    (SELECT b.name_nl FROM basins b WHERE b.venue_id = v.id AND b.is_default_basin = 1 LIMIT 1) AS default_basin_name_nl,
    (SELECT MIN(o.current_waitlist_weeks_min) FROM venue_swim_offerings o WHERE o.venue_id = v.id) AS min_waitlist_weeks,
    (SELECT MIN(o.monthly_price_cents) FROM venue_swim_offerings o WHERE o.venue_id = v.id) AS min_zwemles_monthly_cents
  FROM venues v
`;

export function listVenuesByCity(db: SqliteDatabase, citySlug: string): VenueRow[] {
  return db
    .prepare(
      `${VENUE_ENRICHED_SELECT}
       WHERE v.municipality_slug = ?
       ORDER BY (v.enrichment_tier = 'GOLD_STANDARD') DESC, v.rating_score DESC`
    )
    .all(citySlug) as VenueRow[];
}

export function listAllVenues(db: SqliteDatabase): VenueRow[] {
  return db
    .prepare(
      `${VENUE_ENRICHED_SELECT}
       ORDER BY (v.enrichment_tier = 'GOLD_STANDARD') DESC, (v.rating_score IS NOT NULL) DESC, v.rating_score DESC`
    )
    .all() as VenueRow[];
}

export function findVenuesNearPostcodePc4(
  db: SqliteDatabase,
  pc4: string,
  radiusKm: number
): Array<VenueRow & { distance_km: number }> {
  const origin = db
    .prepare('SELECT lat, lng FROM postcode_pc4 WHERE pc4 = ?')
    .get(pc4) as { lat: number; lng: number } | undefined;

  if (!origin) return [];

  const bbox = computeBoundingBox(origin.lat, origin.lng, radiusKm);
  const candidates = db
    .prepare(
      `SELECT * FROM venues
       WHERE lat BETWEEN @minLat AND @maxLat
         AND lng BETWEEN @minLng AND @maxLng`
    )
    .all(bbox) as VenueRow[];

  return candidates
    .map((v) => ({
      ...v,
      distance_km: haversineDistanceKm(origin.lat, origin.lng, v.lat, v.lng),
    }))
    .filter((v) => v.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km);
}

export function findShortestWaitlistOfferingsNearPc4(
  db: SqliteDatabase,
  pc4: string,
  diplomaTrack: string,
  radiusKm: number,
  limit = 3
): SwimOfferingRow[] {
  const nearbyVenues = findVenuesNearPostcodePc4(db, pc4, radiusKm);
  if (nearbyVenues.length === 0) return [];

  const distanceByVenueId = new Map(nearbyVenues.map((v) => [v.id, v.distance_km]));
  const placeholders = nearbyVenues.map(() => '?').join(',');

  const rows = db
    .prepare(
      `SELECT o.*, v.name AS venue_name, v.slug AS venue_slug, v.municipality_slug,
              v.primary_water_treatment, sp.name AS provider_name
       FROM venue_swim_offerings o
       JOIN venues v ON o.venue_id = v.id
       JOIN swim_providers sp ON o.provider_id = sp.id
       WHERE o.diploma_track = ?
         AND o.venue_id IN (${placeholders})
       ORDER BY o.current_waitlist_weeks_min ASC, o.monthly_price_cents ASC`
    )
    .all(diplomaTrack, ...nearbyVenues.map((v) => v.id)) as SwimOfferingRow[];

  return rows.slice(0, limit).map((r) => ({
    ...r,
    distance_km: distanceByVenueId.get(r.venue_id) ?? 0,
  }));
}

export interface MunicipalityRow {
  slug: string;
  cbs_code: string;
  name: string;
  province_slug: string;
  province_name: string;
  school_vacation_region: 'noord' | 'midden' | 'zuid';
  center_lat: number;
  center_lng: number;
}

export interface WoonplaatsRow {
  id: string;
  bag_id: string;
  slug: string;
  name: string;
  municipality_slug: string;
  municipality_name?: string;
  province_slug: string;
  center_lat: number;
  center_lng: number;
}

export interface WoonplaatsWithCountRow extends WoonplaatsRow {
  venue_count: number;
}

export interface ResolvedLocation {
  type: 'municipality' | 'woonplaats';
  cityName: string;
  municipalitySlug: string;
  municipalityName: string;
  woonplaatsSlug?: string;
  woonplaatsId?: string;
}

/**
 * Pure helper to verify if a BAG woonplaats is a genuine distinct sub-woonplaats
 * (e.g. Weesp in Amsterdam, Zwaag in Hoorn, Ewijk in Beuningen, Abcoude in De Ronde Venen)
 * versus an eponymous municipality seat (e.g. Amsterdam in Amsterdam, Hoorn [slug: hoorn-nh] in Hoorn,
 * Beuningen Gld in Beuningen, Beek [slug: beek-lb] in Beek).
 */
export function isDistinctSubWoonplaats(
  woonplaatsName: string | null | undefined,
  woonplaatsSlug: string | null | undefined,
  municipalityName: string | null | undefined,
  municipalitySlug: string | null | undefined
): boolean {
  if (!woonplaatsName || !woonplaatsSlug || !municipalityName || !municipalitySlug) {
    return false;
  }

  const cleanWpSlug = woonplaatsSlug.trim().toLowerCase();
  const cleanMunSlug = municipalitySlug.trim().toLowerCase();
  if (cleanWpSlug === cleanMunSlug) {
    return false;
  }

  const cleanWpName = woonplaatsName.trim().toLowerCase();
  const cleanMunName = municipalityName.trim().toLowerCase();
  if (cleanWpName === cleanMunName) {
    return false;
  }

  // Strip trailing Dutch province suffixes on name: e.g. "Beuningen Gld" -> "Beuningen"
  const strippedWpName = cleanWpName
    .replace(/\s+(gld|nh|zh|nb|lb|fr|ov|dr|ut|zl|fl|gr|gd)$/i, '')
    .trim();
  if (strippedWpName === cleanMunName) {
    return false;
  }

  // Strip province or municipality suffix on slug: e.g. "hoorn-nh" -> "hoorn", "voorst-gd-voorst" -> "voorst"
  const strippedWpSlug = cleanWpSlug
    .replace(/-(gld|nh|zh|nb|lb|fr|ov|dr|ut|zl|fl|gr|gd)(-[a-z0-9-]+)?$/i, '')
    .trim();
  if (strippedWpSlug === cleanMunSlug) {
    return false;
  }

  return true;
}

export function resolveLocationBySlug(db: SqliteDatabase, slug: string): ResolvedLocation | null {
  // 1. Municipalities always take precedence
  const mun = getMunicipalityBySlug(db, slug);
  if (mun) {
    return {
      type: 'municipality',
      cityName: mun.name,
      municipalitySlug: mun.slug,
      municipalityName: mun.name,
    };
  }

  // 2. Check woonplaatsen
  const wp = getWoonplaatsBySlug(db, slug);
  if (wp) {
    const parentMun = getMunicipalityBySlug(db, wp.municipality_slug);
    const parentMunName = parentMun?.name ?? wp.municipality_slug;
    const parentMunSlug = parentMun?.slug ?? wp.municipality_slug;

    // Check if this is an eponymous municipality seat (e.g. hoorn-nh in hoorn, beuningen-gld in beuningen)
    const isDistinct = isDistinctSubWoonplaats(wp.name, wp.slug, parentMunName, parentMunSlug);
    if (!isDistinct && parentMun) {
      return {
        type: 'municipality',
        cityName: parentMun.name,
        municipalitySlug: parentMun.slug,
        municipalityName: parentMun.name,
      };
    }

    return {
      type: 'woonplaats',
      cityName: wp.name,
      municipalitySlug: parentMunSlug,
      municipalityName: parentMunName,
      woonplaatsSlug: wp.slug,
      woonplaatsId: wp.id,
    };
  }

  return null;
}

export function getMunicipalityBySlug(db: SqliteDatabase, slug: string): MunicipalityRow | null {
  const row = db
    .prepare(
      `SELECT slug, cbs_code, name, province_slug, province_name, school_vacation_region, center_lat, center_lng
       FROM municipalities
       WHERE slug = ?`
    )
    .get(slug) as MunicipalityRow | undefined;
  return row ?? null;
}

export function getWoonplaatsBySlug(db: SqliteDatabase, slug: string): WoonplaatsRow | null {
  const row = db
    .prepare(
      `SELECT w.id, w.bag_id, w.slug, w.name, w.municipality_slug, m.name AS municipality_name,
              w.province_slug, w.center_lat, w.center_lng
       FROM woonplaatsen w
       LEFT JOIN municipalities m ON m.slug = w.municipality_slug
       WHERE w.slug = ?`
    )
    .get(slug) as WoonplaatsRow | undefined;
  return row ?? null;
}

export function listWoonplaatsenByMunicipality(
  db: SqliteDatabase,
  municipalitySlug: string,
  options?: { distinctOnly?: boolean }
): WoonplaatsWithCountRow[] {
  const rows = db
    .prepare(
      `SELECT
         w.id,
         w.bag_id,
         w.slug,
         w.name,
         w.municipality_slug,
         m.name AS municipality_name,
         w.province_slug,
         w.center_lat,
         w.center_lng,
         COUNT(v.id) AS venue_count
       FROM woonplaatsen w
       JOIN municipalities m ON m.slug = w.municipality_slug
       JOIN venues v ON v.woonplaats_id = w.id
       WHERE w.municipality_slug = ?
       GROUP BY w.id
       HAVING COUNT(v.id) >= 1
       ORDER BY venue_count DESC, w.name ASC`
    )
    .all(municipalitySlug) as Array<WoonplaatsWithCountRow & { municipality_name?: string }>;

  return rows.filter((r) => {
    if (options?.distinctOnly === true) {
      return isDistinctSubWoonplaats(r.name, r.slug, r.municipality_name, r.municipality_slug);
    }
    // Filter out eponymous seats that differ from municipality slug (e.g. hoorn-nh in hoorn, beuningen-gld in beuningen)
    if (r.slug !== r.municipality_slug) {
      return isDistinctSubWoonplaats(r.name, r.slug, r.municipality_name, r.municipality_slug);
    }
    return true;
  });
}

export function listIndexableWoonplaatsen(db: SqliteDatabase): WoonplaatsWithCountRow[] {
  const rows = db
    .prepare(
      `SELECT
         w.id,
         w.bag_id,
         w.slug,
         w.name,
         w.municipality_slug,
         m.name AS municipality_name,
         w.province_slug,
         w.center_lat,
         w.center_lng,
         COUNT(v.id) AS venue_count
       FROM woonplaatsen w
       JOIN municipalities m ON m.slug = w.municipality_slug
       JOIN venues v ON v.woonplaats_id = w.id
       WHERE w.slug != w.municipality_slug
       GROUP BY w.id
       HAVING COUNT(v.id) >= 1
       ORDER BY venue_count DESC, w.name ASC`
    )
    .all() as Array<WoonplaatsWithCountRow & { municipality_name?: string }>;

  return rows.filter((r) =>
    isDistinctSubWoonplaats(r.name, r.slug, r.municipality_name, r.municipality_slug)
  );
}

export function listVenuesByWoonplaats(db: SqliteDatabase, woonplaatsSlug: string): VenueRow[] {
  return db
    .prepare(
      `${VENUE_ENRICHED_SELECT}
       WHERE v.woonplaats_slug = ?
       ORDER BY (v.enrichment_tier = 'GOLD_STANDARD') DESC, v.rating_score DESC`
    )
    .all(woonplaatsSlug) as VenueRow[];
}

