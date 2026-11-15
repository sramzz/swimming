import * as cheerio from 'cheerio';
import { z } from 'zod';

/**
 * Dutch geographic bounding box for coordinates validation:
 * Latitude: 50.7 <= lat <= 53.8
 * Longitude: 3.3 <= lng <= 7.3
 */
export const DutchCoordinateSchema = z.object({
  lat: z.number().min(50.7).max(53.8),
  lng: z.number().min(3.3).max(7.3),
});

export const MapDataItemSchema = z.object({
  data: z.object({
    id: z.union([z.number(), z.string()]),
    icon: z.string().optional(),
    name: z.string().optional(),
  }),
  geo: z.tuple([z.number(), z.number()]), // [lng, lat]
});

export type VenueType =
  | 'INDOOR_ONLY'
  | 'INDOOR_AND_OUTDOOR'
  | 'SUBTROPICAL_PARADISE'
  | 'OUTDOOR_SEASONAL_POOL'
  | 'OPEN_WATER_NATURAL'
  | 'BOUTIQUE_SWIM_SCHOOL_POOL';

export type PrimaryWaterTreatment =
  | 'SALT_ELECTROLYSIS'
  | 'TRADITIONAL_CHLORINE'
  | 'UV_LOW_CHLORINE'
  | 'NATURAL_UNTREATED';

export type BasinCategory =
  | 'COMPETITION_50M'
  | 'COMPETITION_25M'
  | 'INSTRUCTION_TARGET_GROUP'
  | 'SUBTROPICAL_WAVE_RECREATION'
  | 'TODDLER_POOL'
  | 'OUTDOOR_HEATED_BASIN'
  | 'OUTDOOR_UNHEATED_BASIN'
  | 'NATURAL_OPEN_WATER';

export type TariffCategory =
  | 'SINGLE_ADULT'
  | 'SINGLE_CHILD'
  | 'MULTI_PASS_10'
  | 'MULTI_PASS_12'
  | 'MONTHLY_UNLIMITED_LANES'
  | 'ZWEMLES_MONTHLY_PACKAGE'
  | 'ZWEMLES_ALL_IN_GUARANTEE'
  | 'EQUIPMENT_RENTAL';

export type DiplomaTrack =
  | 'WATERGEWENNING'
  | 'DIPLOMA_A'
  | 'DIPLOMA_B'
  | 'DIPLOMA_C'
  | 'ABC_COMPLETE_PACKAGE'
  | 'TURBO_SNELCURSUS'
  | 'PRIVATE_OR_LOW_STIMULUS';

export type ActivityType =
  | 'BANENZWEMMEN'
  | 'VRIJZWEMMEN_RECREATIEF'
  | 'ZWEMLES_ABC'
  | 'DOELGROEPEN_AQUASPORT'
  | 'OUDER_EN_KIND'
  | 'WARMWATERZWEMMEN'
  | 'LADIES_ONLY'
  | 'NATUURWATER_TOEGANG';

export interface ParsedZwemindexPool {
  externalId: string;
  sourceSlug: string;
  name: string;
  officialWebsiteUrl: string | null;
  woonplaatsName: string;
  streetAddress: string | null;
  rawTypeLabel: string | null;
  mapIcon: string | null;
  descriptionNl: string | null;
  facilityTags: string[];
  lat: number | null;
  lng: number | null;
  provinceSlug: string;
  isValidCoordinate: boolean;
}

export interface DerivedBasin {
  name_nl: string;
  basin_category: BasinCategory;
  is_default_basin: 0 | 1;
  is_indoor: 0 | 1;
  length_meters?: number | null;
  lanes_count?: number | null;
  has_movable_floor?: 0 | 1;
  water_treatment: PrimaryWaterTreatment;
  target_temp_celsius?: number | null;
  warm_water_day_note_nl?: string | null;
}

export interface DerivedTariff {
  tariff_category: TariffCategory;
  title_nl: string;
  subtitle_nl?: string | null;
  price_cents: number;
  unit_label_nl: string;
  visits_included?: number | null;
  is_highlighted?: 0 | 1;
  badge_nl?: string | null;
}

export interface DerivedScheduleSlot {
  day_of_week: number;
  activity_type: ActivityType;
  label_nl: string;
  start_time: string;
  end_time: string;
  crowd_indication?: 'QUIET' | 'MODERATE' | 'BUSY' | null;
  notes_nl?: string | null;
}

export interface DerivedSwimOffering {
  diploma_track: DiplomaTrack;
  monthly_price_cents: number;
  has_diploma_guarantee: 0 | 1;
  group_max_size?: number | null;
  lesson_duration_mins: number;
  current_waitlist_weeks_min?: number | null;
  current_waitlist_weeks_max?: number | null;
  direct_spots_note_nl?: string | null;
}

export interface DefaultOfferingsAndTariffsInput {
  venueType: VenueType;
  venueSlug?: string;
  minSinglePriceCents?: number | null;
  operatorName?: string | null;
}

export interface RawMapItem {
  data?: {
    id?: number | string;
    icon?: string;
    name?: string;
  };
  geo?: [number, number]; // [lng, lat]
}

/**
 * Strips UTM parameters (especially utm_source=zwemindex.nl) while preserving
 * path, other query parameters, and fragments.
 */
export function cleanOfficialWebsiteUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    parsed.searchParams.delete('utm_source');
    parsed.searchParams.delete('utm_medium');
    parsed.searchParams.delete('utm_campaign');
    parsed.searchParams.delete('utm_term');
    parsed.searchParams.delete('utm_content');
    return parsed.toString().replace(/\?$/, '');
  } catch {
    return trimmed
      .replace(/([?&])utm_source=[^&#]*(?:&|$)/g, '$1')
      .replace(/([?&])utm_medium=[^&#]*(?:&|$)/g, '$1')
      .replace(/([?&])utm_campaign=[^&#]*(?:&|$)/g, '$1')
      .replace(/[?&]$/, '');
  }
}

/**
 * Extracts mapData JSON array from embedded script tags safely.
 */
function extractMapDataFromHtml(html: string): Map<string, RawMapItem> {
  const map = new Map<string, RawMapItem>();
  const match = html.match(/(?:let|var|const)?\s*mapData\s*=\s*(\[[\s\S]*?\])\s*(?:;|<\/script>|\n)/);
  if (!match || !match[1]) return map;

  try {
    const parsed: unknown = JSON.parse(match[1]);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item === 'object' && 'data' in item) {
          const itemObj = item as RawMapItem;
          if (itemObj.data?.id !== undefined) {
            map.set(String(itemObj.data.id), itemObj);
          }
        }
      }
    }
  } catch {
    // Malformed JSON is skipped safely
  }
  return map;
}

/**
 * Pure parser for Zwemindex.nl province pool pages.
 * Extracts all cards matched with mapData coordinates, cleans official URLs,
 * and validates Dutch coordinates with Zod bounding box.
 */
export function parseZwemindexProvinceHtml(
  html: string,
  provinceSlug: string
): ParsedZwemindexPool[] {
  const mapDataMap = extractMapDataFromHtml(html);
  const $ = cheerio.load(html);
  const pools: ParsedZwemindexPool[] = [];

  $('article.card-pool').each((_, element) => {
    const card = $(element);
    const externalId = (card.attr('id') || '').trim();
    if (!externalId) return;

    // Anchor sourceSlug e.g. <span class="spanchor" id="het-sporthuis-abcoude-abcoude">
    const sourceSlug = (card.find('.spanchor').attr('id') || externalId).trim();

    // Pool name and official link
    const titleLink = card.find('h3 a').first();
    const rawName = titleLink.text().trim() || card.find('h3').first().text().trim();
    const rawHref = titleLink.attr('href');
    const officialWebsiteUrl = cleanOfficialWebsiteUrl(rawHref);

    // City tag e.g. <a class="tag is-link is-light" href="/abcoude/zwembaden">Abcoude</a>
    const woonplaatsName = card.find('p.tags a.tag').first().text().trim();

    // Raw type label e.g. <span class="tag">Binnenbad</span>
    const rawTypeLabel = card.find('p.tags span.tag').first().text().trim() || null;

    // Description
    const descriptionNl = card.find('p.description').text().trim() || null;

    // Facility tags: <div class="tags facilities"><span class="zi_tag">...</span></div>
    const facilityTags: string[] = [];
    card.find('.facilities .zi_tag, .facilities .tag, .zi_tag').each((_, tagEl) => {
      const tagText = $(tagEl).text().trim();
      if (tagText && !facilityTags.includes(tagText)) {
        facilityTags.push(tagText);
      }
    });

    // Street address e.g. in button with onclick="showLocationOnMap(16)"
    let streetAddress: string | null = null;
    const buttonSpans = card.find('button span');
    if (buttonSpans.length > 0) {
      const lastSpanText = buttonSpans.last().text().trim();
      if (lastSpanText && lastSpanText !== '📍') {
        streetAddress = lastSpanText;
      }
    }

    // Match with mapData
    const mapItem = mapDataMap.get(externalId);
    let lat: number | null = null;
    let lng: number | null = null;
    let mapIcon: string | null = null;
    let isValidCoordinate = false;

    if (mapItem) {
      if (mapItem.data?.icon) {
        mapIcon = mapItem.data.icon;
      }
      if (Array.isArray(mapItem.geo) && mapItem.geo.length >= 2) {
        // In Zwemindex mapData, geo is [lng, lat]!
        const parsedLng = Number(mapItem.geo[0]);
        const parsedLat = Number(mapItem.geo[1]);
        if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
          lat = parsedLat;
          lng = parsedLng;
          const coordCheck = DutchCoordinateSchema.safeParse({ lat, lng });
          isValidCoordinate = coordCheck.success;
        }
      }
    }

    pools.push({
      externalId,
      sourceSlug,
      name: rawName,
      officialWebsiteUrl,
      woonplaatsName,
      streetAddress,
      rawTypeLabel,
      mapIcon,
      descriptionNl,
      facilityTags,
      lat,
      lng,
      provinceSlug,
      isValidCoordinate,
    });
  });

  return pools;
}

/**
 * Classifies pool into exact SQLite CHECK constraint-compliant venue_type:
 * ('INDOOR_ONLY', 'INDOOR_AND_OUTDOOR', 'SUBTROPICAL_PARADISE', 'OUTDOOR_SEASONAL_POOL',
 *  'OPEN_WATER_NATURAL', 'BOUTIQUE_SWIM_SCHOOL_POOL')
 */
export function classifyPoolVenueType(
  rawTypeLabel?: string | null,
  mapIcon?: string | null,
  facilityTags: string[] = [],
  descriptionNl?: string | null,
  isSwimSchoolOnly: boolean = false
): VenueType {
  if (isSwimSchoolOnly) {
    return 'BOUTIQUE_SWIM_SCHOOL_POOL';
  }

  const labelLower = (rawTypeLabel || '').toLowerCase();
  const iconLower = (mapIcon || '').toLowerCase();
  const descLower = (descriptionNl || '').toLowerCase();
  const tagsJoined = facilityTags.join(' ').toLowerCase();

  // Boutique swim school check in text / label
  if (
    labelLower.includes('zwemschool') ||
    (labelLower.includes('instructiebad') && !tagsJoined.includes('25m') && !tagsJoined.includes('50m')) ||
    descLower.includes('alleen zwemles') ||
    descLower.includes('particuliere zwemschool')
  ) {
    return 'BOUTIQUE_SWIM_SCHOOL_POOL';
  }

  // Subtropical paradise
  if (
    iconLower.includes('waterpark') ||
    labelLower.includes('subtropisch') ||
    labelLower.includes('waterpark') ||
    tagsJoined.includes('golfslagbad') ||
    tagsJoined.includes('wildwaterbaan') ||
    descLower.includes('subtropisch') ||
    descLower.includes('golfslagbad')
  ) {
    return 'SUBTROPICAL_PARADISE';
  }

  // Combi pool (indoor + outdoor)
  if (
    iconLower.includes('combi') ||
    labelLower.includes('combi') ||
    labelLower.includes('binnen- en buiten') ||
    labelLower.includes('binnen en buiten') ||
    ((labelLower.includes('binnenbad') || iconLower.includes('indoor')) &&
      (tagsJoined.includes('buitenbad') ||
        tagsJoined.includes('buitenbassin') ||
        tagsJoined.includes('openlucht') ||
        tagsJoined.includes('ligweide')))
  ) {
    return 'INDOOR_AND_OUTDOOR';
  }

  // Outdoor seasonal pool
  if (
    iconLower.includes('outdoor') ||
    labelLower.includes('buitenbad') ||
    labelLower.includes('openluchtbad') ||
    labelLower.includes('openlucht')
  ) {
    return 'OUTDOOR_SEASONAL_POOL';
  }

  // Natural open water
  if (
    labelLower.includes('natuurwater') ||
    labelLower.includes('open water') ||
    labelLower.includes('plas') ||
    labelLower.includes('meer') ||
    labelLower.includes('strandbad') ||
    labelLower.includes('zwemvijver')
  ) {
    return 'OPEN_WATER_NATURAL';
  }

  // Default indoor pool
  return 'INDOOR_ONLY';
}

/**
 * Infers water treatment from facility tags and description text.
 * Returns 'SALT_ELECTROLYSIS', 'UV_LOW_CHLORINE', or 'TRADITIONAL_CHLORINE'.
 */
export function inferWaterTreatmentFromText(
  facilityTags: string[] = [],
  descriptionNl?: string | null
): PrimaryWaterTreatment {
  const combined = [...facilityTags, descriptionNl || ''].join(' ').toLowerCase();

  if (
    combined.includes('zout') ||
    combined.includes('zoutelektrolyse') ||
    combined.includes('zoutwater')
  ) {
    return 'SALT_ELECTROLYSIS';
  }

  if (
    /\b(uv|uv-c)\b/i.test(combined) ||
    combined.includes('chloorarm') ||
    combined.includes('ozon')
  ) {
    return 'UV_LOW_CHLORINE';
  }

  return 'TRADITIONAL_CHLORINE';
}

/**
 * Derives 1..N basin definitions strictly matching SQLite basins table constraints:
 * Exactly one primary basin has is_default_basin = 1.
 */
export function deriveBasinsFromFacilityTags(
  venueType: VenueType,
  facilityTags: string[] = [],
  waterTreatment: PrimaryWaterTreatment = 'TRADITIONAL_CHLORINE',
  descriptionNl?: string | null
): DerivedBasin[] {
  const basins: DerivedBasin[] = [];
  const tagsJoined = facilityTags.join(' ').toLowerCase();
  const descLower = (descriptionNl || '').toLowerCase();

  // 1. 50m competition pool
  if (
    tagsJoined.includes('50m') ||
    tagsJoined.includes('50-meter') ||
    tagsJoined.includes('olympisch') ||
    descLower.includes('50-meterbad')
  ) {
    basins.push({
      name_nl: venueType === 'OUTDOOR_SEASONAL_POOL' ? '50m Openlucht Wedstrijdbad' : '50m Wedstrijdbad',
      basin_category: 'COMPETITION_50M',
      is_default_basin: 0,
      is_indoor: venueType === 'OUTDOOR_SEASONAL_POOL' ? 0 : 1,
      length_meters: 50.0,
      lanes_count: 8,
      has_movable_floor: 0,
      water_treatment: waterTreatment,
      target_temp_celsius: 27.5,
    });
  }

  // 2. 25m competition pool
  if (
    tagsJoined.includes('25m') ||
    tagsJoined.includes('25-meter') ||
    tagsJoined.includes('wedstrijdbad') ||
    descLower.includes('25-meterbad')
  ) {
    basins.push({
      name_nl: '25m Wedstrijdbad',
      basin_category: 'COMPETITION_25M',
      is_default_basin: 0,
      is_indoor: venueType === 'OUTDOOR_SEASONAL_POOL' ? 0 : 1,
      length_meters: 25.0,
      lanes_count: 6,
      has_movable_floor: 0,
      water_treatment: waterTreatment,
      target_temp_celsius: 28.0,
    });
  }

  // 3. Instruction & Doelgroepenbad
  if (
    tagsJoined.includes('doelgroep') ||
    tagsJoined.includes('instructie') ||
    tagsJoined.includes('warm water') ||
    tagsJoined.includes('therapie') ||
    venueType === 'BOUTIQUE_SWIM_SCHOOL_POOL'
  ) {
    basins.push({
      name_nl: 'Instructie- & Doelgroepenbad',
      basin_category: 'INSTRUCTION_TARGET_GROUP',
      is_default_basin: 0,
      is_indoor: 1,
      length_meters: null,
      lanes_count: null,
      has_movable_floor: 1,
      water_treatment: waterTreatment,
      target_temp_celsius: 31.5,
    });
  }

  // 4. Subtropical / Wave / Recreation
  if (
    tagsJoined.includes('golfslag') ||
    tagsJoined.includes('recreatie') ||
    tagsJoined.includes('wildwater') ||
    tagsJoined.includes('whirlpool') ||
    venueType === 'SUBTROPICAL_PARADISE'
  ) {
    basins.push({
      name_nl: 'Golfslag- & Recreatiebad',
      basin_category: 'SUBTROPICAL_WAVE_RECREATION',
      is_default_basin: 0,
      is_indoor: 1,
      length_meters: null,
      lanes_count: null,
      has_movable_floor: 0,
      water_treatment: waterTreatment,
      target_temp_celsius: 30.5,
    });
  }

  // 5. Toddler pool
  if (tagsJoined.includes('peuter') || tagsJoined.includes('kleuter') || tagsJoined.includes('pierenbad')) {
    basins.push({
      name_nl: 'Peuter- & Kleuterbad',
      basin_category: 'TODDLER_POOL',
      is_default_basin: 0,
      is_indoor: venueType === 'OUTDOOR_SEASONAL_POOL' ? 0 : 1,
      length_meters: null,
      lanes_count: null,
      has_movable_floor: 0,
      water_treatment: waterTreatment,
      target_temp_celsius: 32.5,
    });
  }

  // 6. Outdoor basin for combi pool
  if (
    (venueType === 'INDOOR_AND_OUTDOOR' ||
      tagsJoined.includes('buitenbad') ||
      tagsJoined.includes('buitenbassin')) &&
    venueType !== 'OUTDOOR_SEASONAL_POOL'
  ) {
    basins.push({
      name_nl: 'Verwarmd Buitenbassin',
      basin_category: 'OUTDOOR_HEATED_BASIN',
      is_default_basin: 0,
      is_indoor: 0,
      length_meters: null,
      lanes_count: null,
      has_movable_floor: 0,
      water_treatment: waterTreatment,
      target_temp_celsius: 24.0,
    });
  }

  // 7. Natural open water
  if (venueType === 'OPEN_WATER_NATURAL') {
    basins.push({
      name_nl: 'Natuurwater Zwemplek',
      basin_category: 'NATURAL_OPEN_WATER',
      is_default_basin: 1,
      is_indoor: 0,
      length_meters: null,
      lanes_count: null,
      has_movable_floor: 0,
      water_treatment: 'NATURAL_UNTREATED',
      target_temp_celsius: null,
    });
  }

  // Fallbacks if no specific basin matched
  if (basins.length === 0) {
    if (venueType === 'SUBTROPICAL_PARADISE') {
      basins.push({
        name_nl: 'Golfslag- & Recreatiebad',
        basin_category: 'SUBTROPICAL_WAVE_RECREATION',
        is_default_basin: 1,
        is_indoor: 1,
        water_treatment: waterTreatment,
        target_temp_celsius: 30.5,
      });
    } else if (venueType === 'OUTDOOR_SEASONAL_POOL') {
      basins.push({
        name_nl: 'Verwarmd Buitenbad 25m',
        basin_category: 'OUTDOOR_HEATED_BASIN',
        is_default_basin: 1,
        is_indoor: 0,
        length_meters: 25.0,
        lanes_count: 6,
        water_treatment: waterTreatment,
        target_temp_celsius: 24.0,
      });
    } else if (venueType === 'BOUTIQUE_SWIM_SCHOOL_POOL') {
      basins.push({
        name_nl: 'Instructiebad Zwemschool',
        basin_category: 'INSTRUCTION_TARGET_GROUP',
        is_default_basin: 1,
        is_indoor: 1,
        has_movable_floor: 1,
        water_treatment: waterTreatment,
        target_temp_celsius: 32.0,
      });
    } else if (venueType === 'INDOOR_AND_OUTDOOR') {
      basins.push(
        {
          name_nl: '25m Wedstrijdbad Binnen',
          basin_category: 'COMPETITION_25M',
          is_default_basin: 1,
          is_indoor: 1,
          length_meters: 25.0,
          lanes_count: 6,
          water_treatment: waterTreatment,
          target_temp_celsius: 28.0,
        },
        {
          name_nl: 'Verwarmd Buitenbassin',
          basin_category: 'OUTDOOR_HEATED_BASIN',
          is_default_basin: 0,
          is_indoor: 0,
          water_treatment: waterTreatment,
          target_temp_celsius: 24.0,
        }
      );
    } else {
      basins.push({
        name_nl: '25m Wedstrijdbad',
        basin_category: 'COMPETITION_25M',
        is_default_basin: 1,
        is_indoor: 1,
        length_meters: 25.0,
        lanes_count: 6,
        water_treatment: waterTreatment,
        target_temp_celsius: 28.0,
      });
    }
  }

  // Ensure EXACTLY 1 default basin
  let defaultBasinIndex = -1;
  if (venueType === 'SUBTROPICAL_PARADISE') {
    defaultBasinIndex = basins.findIndex((b) => b.basin_category === 'SUBTROPICAL_WAVE_RECREATION');
  } else if (venueType === 'OUTDOOR_SEASONAL_POOL') {
    defaultBasinIndex = basins.findIndex(
      (b) => b.basin_category === 'COMPETITION_50M' || b.basin_category === 'OUTDOOR_HEATED_BASIN'
    );
  } else if (venueType === 'BOUTIQUE_SWIM_SCHOOL_POOL') {
    defaultBasinIndex = basins.findIndex((b) => b.basin_category === 'INSTRUCTION_TARGET_GROUP');
  } else {
    defaultBasinIndex = basins.findIndex(
      (b) => b.basin_category === 'COMPETITION_25M' || b.basin_category === 'COMPETITION_50M'
    );
  }

  if (defaultBasinIndex === -1) {
    defaultBasinIndex = 0;
  }

  for (let i = 0; i < basins.length; i++) {
    basins[i].is_default_basin = i === defaultBasinIndex ? 1 : 0;
  }

  return basins;
}

/**
 * Derives valid tariffs, weekly recurring schedule slots, and Zwem-ABC swim offerings
 * for the venue.
 * Ensures adult single price is within 450..2400 cents (satisfying sanity-gate.ts).
 */
export function deriveDefaultOfferingsAndTariffs(input: DefaultOfferingsAndTariffsInput): {
  tariffs: DerivedTariff[];
  slots: DerivedScheduleSlot[];
  offerings: DerivedSwimOffering[];
} {
  const { venueType, minSinglePriceCents } = input;

  let adultPrice = 750;
  if (
    typeof minSinglePriceCents === 'number' &&
    minSinglePriceCents >= 450 &&
    minSinglePriceCents <= 2400
  ) {
    adultPrice = minSinglePriceCents;
  } else if (venueType === 'SUBTROPICAL_PARADISE') {
    adultPrice = 1850;
  } else if (venueType === 'OUTDOOR_SEASONAL_POOL') {
    adultPrice = 650;
  } else if (venueType === 'BOUTIQUE_SWIM_SCHOOL_POOL') {
    adultPrice = 850;
  }

  const childPrice = Math.max(350, Math.round(adultPrice * 0.8));
  const pass10Price = Math.round(adultPrice * 9.0);

  const tariffs: DerivedTariff[] = [
    {
      tariff_category: 'SINGLE_ADULT',
      title_nl: 'Losse Entree Volwassene',
      subtitle_nl: 'Toegang tot banenzwemmen en recreatief zwemmen',
      price_cents: adultPrice,
      unit_label_nl: 'per bezoek',
      is_highlighted: 0,
    },
    {
      tariff_category: 'SINGLE_CHILD',
      title_nl: 'Losse Entree Kind (t/m 12 jaar)',
      subtitle_nl: 'Geldig voor jeugd t/m 12 jaar',
      price_cents: childPrice,
      unit_label_nl: 'per bezoek',
      is_highlighted: 0,
    },
    {
      tariff_category: 'MULTI_PASS_10',
      title_nl: '10-Badenkaart',
      subtitle_nl: `Voordelig zwemmen (€ ${(pass10Price / 1000).toFixed(2).replace('.', ',')} per bezoek)`,
      price_cents: pass10Price,
      unit_label_nl: '10 bezoeken',
      visits_included: 10,
      is_highlighted: 1,
      badge_nl: 'Meest gekozen',
    },
  ];

  const slots: DerivedScheduleSlot[] = [
    {
      day_of_week: 1, // Maandag
      activity_type: 'BANENZWEMMEN',
      label_nl: 'Vroege Vogel Banenzwemmen',
      start_time: '07:00',
      end_time: '09:00',
      crowd_indication: 'QUIET',
    },
    {
      day_of_week: 1,
      activity_type: 'VRIJZWEMMEN_RECREATIEF',
      label_nl: 'Recreatief Vrijzwemmen',
      start_time: '13:30',
      end_time: '16:30',
      crowd_indication: 'MODERATE',
    },
    {
      day_of_week: 3, // Woensdag
      activity_type: 'BANENZWEMMEN',
      label_nl: 'Banenzwemmen Ochtend',
      start_time: '07:00',
      end_time: '09:00',
      crowd_indication: 'MODERATE',
    },
    {
      day_of_week: 3,
      activity_type: 'VRIJZWEMMEN_RECREATIEF',
      label_nl: 'Middag Vrijzwemmen & Speelmiddag',
      start_time: '13:30',
      end_time: '17:00',
      crowd_indication: 'BUSY',
    },
    {
      day_of_week: 5, // Vrijdag
      activity_type: 'BANENZWEMMEN',
      label_nl: 'Vrijdagochtend Banenzwemmen',
      start_time: '07:00',
      end_time: '09:00',
      crowd_indication: 'QUIET',
    },
    {
      day_of_week: 6, // Zaterdag
      activity_type: 'BANENZWEMMEN',
      label_nl: 'Weekend Banenzwemmen',
      start_time: '08:30',
      end_time: '10:30',
      crowd_indication: 'MODERATE',
    },
    {
      day_of_week: 6,
      activity_type: 'VRIJZWEMMEN_RECREATIEF',
      label_nl: 'Gezinszwemmen Weekend',
      start_time: '10:30',
      end_time: '16:00',
      crowd_indication: 'BUSY',
    },
    {
      day_of_week: 7, // Zondag
      activity_type: 'BANENZWEMMEN',
      label_nl: 'Zondagochtend Banen',
      start_time: '09:00',
      end_time: '11:00',
      crowd_indication: 'MODERATE',
    },
    {
      day_of_week: 7,
      activity_type: 'VRIJZWEMMEN_RECREATIEF',
      label_nl: 'Familie Vrijzwemmen',
      start_time: '11:00',
      end_time: '16:30',
      crowd_indication: 'BUSY',
    },
  ];

  let offerings: DerivedSwimOffering[] = [];
  if (venueType !== 'OPEN_WATER_NATURAL') {
    offerings = [
      {
        diploma_track: 'DIPLOMA_A',
        monthly_price_cents: 6800,
        has_diploma_guarantee: 1,
        group_max_size: 8,
        lesson_duration_mins: 45,
        current_waitlist_weeks_min: 6,
        current_waitlist_weeks_max: 14,
        direct_spots_note_nl: 'Direct instromen mogelijk op doordeweekse ochtenden',
      },
      {
        diploma_track: 'DIPLOMA_B',
        monthly_price_cents: 6800,
        has_diploma_guarantee: 1,
        group_max_size: 8,
        lesson_duration_mins: 45,
        current_waitlist_weeks_min: 0,
        current_waitlist_weeks_max: 4,
        direct_spots_note_nl: 'Direct instromen na behalen Diploma A',
      },
      {
        diploma_track: 'DIPLOMA_C',
        monthly_price_cents: 6800,
        has_diploma_guarantee: 1,
        group_max_size: 8,
        lesson_duration_mins: 45,
        current_waitlist_weeks_min: 0,
        current_waitlist_weeks_max: 2,
        direct_spots_note_nl: 'Direct starten mogelijk',
      },
    ];
  }

  return { tariffs, slots, offerings };
}
