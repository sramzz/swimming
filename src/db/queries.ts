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
  lastmod_at: string;
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

export function listVenuesByCity(db: SqliteDatabase, citySlug: string): VenueRow[] {
  return db
    .prepare('SELECT * FROM venues WHERE municipality_slug = ? ORDER BY rating_score DESC')
    .all(citySlug) as VenueRow[];
}

export function listAllVenues(db: SqliteDatabase): VenueRow[] {
  return db.prepare('SELECT * FROM venues ORDER BY rating_score DESC').all() as VenueRow[];
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
