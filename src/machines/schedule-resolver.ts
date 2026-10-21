export type ScheduleVerificationState =
  | 'VERIFIED_PUBLISHED'
  | 'CONFIRMED_REGULAR'
  | 'UNCONFIRMED_FALLBACK';

export type VenueDisplayScheduleState =
  | 'OPEN_REGULAR'
  | 'OPEN_VERIFIED_SPECIAL_SCHEDULE'
  | 'VACATION_UNCONFIRMED_FALLBACK'
  | 'HOLIDAY_UNCONFIRMED_FALLBACK'
  | 'WARNING_WATER_QUALITY'
  | 'CLOSED_UNSAFE_WEATHER';

export interface SchedulePeriodCandidate {
  id: string;
  scheduleType: 'REGULAR_WINTER' | 'REGULAR_SUMMER' | 'SCHOOL_VACATION' | 'PUBLIC_HOLIDAY' | 'TEMPORARY_OVERRIDE';
  titleNl: string;
  validFrom: string;
  validTo: string;
  priority: number;
  verificationState: ScheduleVerificationState;
}

export interface ScheduleResolverInput {
  todayIsoDate: string;
  isOutdoorOrOpenWater: boolean;
  vacationRegion: 'noord' | 'midden' | 'zuid';
  publicHolidayNameNl: string | null;
  activeVacationNameNl: string | null;
  knmiAlert: { code: 'GEEL' | 'ORANJE' | 'ROOD'; phenomenon: string; headlineNl: string } | null;
  outdoorWaterQualityState:
    | 'CLEAN_APPROVED'
    | 'WARNING_BLAUWALG'
    | 'WARNING_ZWEMMERSJEUK'
    | 'NEGATIVE_SWIM_ADVICE'
    | 'SWIMMING_BAN';
  outdoorWaterTempCelsius: number | null;
  periods: SchedulePeriodCandidate[];
}

export interface ScheduleResolutionResult {
  displayState: VenueDisplayScheduleState;
  activePeriodId: string | null;
  upcomingSpecialPeriod: SchedulePeriodCandidate | null;
  bannerSeverity: 'NONE' | 'INFO' | 'WARNING' | 'CRITICAL';
  bannerNl: string | null;
  wetsuitBannerNl: string | null;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function daysBetween(startIso: string, endIso: string): number {
  const t1 = Date.parse(`${startIso}T00:00:00Z`);
  const t2 = Date.parse(`${endIso}T00:00:00Z`);
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

export function resolveVenueScheduleAndAlerts(
  input: ScheduleResolverInput
): ScheduleResolutionResult {
  const wetsuitBannerNl =
    input.isOutdoorOrOpenWater &&
    input.outdoorWaterTempCelsius !== null &&
    input.outdoorWaterTempCelsius < 16.0
      ? `Advies: Wetsuit aanbevolen (Watertemperatuur ${input.outdoorWaterTempCelsius.toFixed(1)}°C) + zichtbare zwemboei.`
      : null;

  const activePeriods = input.periods
    .filter((p) => p.validFrom <= input.todayIsoDate && p.validTo >= input.todayIsoDate)
    .sort((a, b) => b.priority - a.priority);

  const primaryPeriod = activePeriods[0] ?? null;

  const upcomingSpecialPeriod =
    input.periods
      .filter(
        (p) =>
          p.scheduleType !== 'REGULAR_WINTER' &&
          p.scheduleType !== 'REGULAR_SUMMER' &&
          p.verificationState === 'VERIFIED_PUBLISHED' &&
          daysBetween(input.todayIsoDate, p.validFrom) > 0 &&
          daysBetween(input.todayIsoDate, p.validFrom) <= 14
      )
      .sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0] ?? null;

  // 1. KNMI Code Oranje / Rood check
  if (input.knmiAlert && (input.knmiAlert.code === 'ORANJE' || input.knmiAlert.code === 'ROOD')) {
    if (input.isOutdoorOrOpenWater) {
      return {
        displayState: 'CLOSED_UNSAFE_WEATHER',
        activePeriodId: primaryPeriod?.id ?? null,
        upcomingSpecialPeriod,
        bannerSeverity: 'CRITICAL',
        bannerNl: `KNMI Code ${capitalize(input.knmiAlert.code.toLowerCase())} (${input.knmiAlert.phenomenon}): Buitenzwemmen sterk afgeraden of locatie gesloten.`,
        wetsuitBannerNl,
      };
    }
  }

  // 2. Water Quality Alert on Outdoor/Open Water
  if (input.isOutdoorOrOpenWater && input.outdoorWaterQualityState !== 'CLEAN_APPROVED') {
    return {
      displayState: 'WARNING_WATER_QUALITY',
      activePeriodId: primaryPeriod?.id ?? null,
      upcomingSpecialPeriod,
      bannerSeverity: 'CRITICAL',
      bannerNl: `Officiële Zwemwater.nl waarschuwing (${input.outdoorWaterQualityState.replace(/_/g, ' ')}): Controleer waterkwaliteit voor het zwemmen.`,
      wetsuitBannerNl,
    };
  }

  // 3. Dutch Public Holiday check
  if (input.publicHolidayNameNl) {
    if (primaryPeriod && primaryPeriod.scheduleType === 'PUBLIC_HOLIDAY' && primaryPeriod.verificationState === 'VERIFIED_PUBLISHED') {
      return {
        displayState: 'OPEN_VERIFIED_SPECIAL_SCHEDULE',
        activePeriodId: primaryPeriod.id,
        upcomingSpecialPeriod,
        bannerSeverity: 'INFO',
        bannerNl: `Vandaag is het ${input.publicHolidayNameNl}: Bevestigd feestdagenrooster (${primaryPeriod.titleNl}) is actief.`,
        wetsuitBannerNl,
      };
    }
    return {
      displayState: 'HOLIDAY_UNCONFIRMED_FALLBACK',
      activePeriodId: primaryPeriod?.id ?? null,
      upcomingSpecialPeriod,
      bannerSeverity: 'WARNING',
      bannerNl: `Let op: Vandaag is het ${input.publicHolidayNameNl}. Aangepaste openingstijden zijn nog niet bevestigd — controleer de website van het zwembad voor vertrek.`,
      wetsuitBannerNl,
    };
  }

  // 4. Regional School Vacation check
  if (input.activeVacationNameNl) {
    const regionLabel = `Regio ${capitalize(input.vacationRegion)}`;
    if (
      primaryPeriod &&
      primaryPeriod.scheduleType === 'SCHOOL_VACATION' &&
      primaryPeriod.verificationState === 'VERIFIED_PUBLISHED'
    ) {
      return {
        displayState: 'OPEN_VERIFIED_SPECIAL_SCHEDULE',
        activePeriodId: primaryPeriod.id,
        upcomingSpecialPeriod,
        bannerSeverity: 'INFO',
        bannerNl: `${primaryPeriod.titleNl} is actief (${regionLabel}).`,
        wetsuitBannerNl,
      };
    }
    return {
      displayState: 'VACATION_UNCONFIRMED_FALLBACK',
      activePeriodId: primaryPeriod?.id ?? null,
      upcomingSpecialPeriod,
      bannerSeverity: 'WARNING',
      bannerNl: `Let op: Het is momenteel ${input.activeVacationNameNl} (${regionLabel}). Het vakantierooster is nog niet bevestigd — controleer voor vertrek of reguliere zwemlessen/banen doorgaan.`,
      wetsuitBannerNl,
    };
  }

  return {
    displayState: 'OPEN_REGULAR',
    activePeriodId: primaryPeriod?.id ?? null,
    upcomingSpecialPeriod,
    bannerSeverity: upcomingSpecialPeriod ? 'INFO' : 'NONE',
    bannerNl: upcomingSpecialPeriod
      ? `Binnenkort: ${upcomingSpecialPeriod.titleNl} geldig vanaf ${upcomingSpecialPeriod.validFrom}.`
      : null,
    wetsuitBannerNl,
  };
}
