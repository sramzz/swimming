import crypto from 'node:crypto';
import type { SqliteDatabase } from '../db/client';

export interface SchoolVacationItem {
  schoolYear: string;
  vacationName: string;
  region: 'noord' | 'midden' | 'zuid';
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
}

export interface WeatherAlertItem {
  provinceSlug: string;
  knmiCode: 'GROEN' | 'GEEL' | 'ORANJE' | 'ROOD';
  phenomenon: string;
  headlineNl: string;
  validFrom: string; // ISO8601
  validTo: string; // ISO8601
}

export interface WaterConditionItem {
  sourceAuthority: 'RIJKSWATERSTAAT' | 'ZWEMWATER_NL' | 'MUNICIPAL_SENSOR' | 'MANUAL';
  waterTempCelsius: number | null;
  waterQualityState:
    | 'CLEAN_APPROVED'
    | 'WARNING_BLAUWALG'
    | 'WARNING_ZWEMMERSJEUK'
    | 'NEGATIVE_SWIM_ADVICE'
    | 'SWIMMING_BAN';
  measuredAt?: string;
}

export interface WaterConditionResult {
  conditionId: string;
  venueId: string;
  waterQualityState: string;
  waterTempCelsius: number | null;
  wetsuitAdviceNl: string;
}

function subtractDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function computeWetsuitAdvice(tempCelsius: number | null): string {
  if (tempCelsius === null) return 'Zwemkleding of wetsuit naar eigen inzicht';
  if (tempCelsius < 12) return 'Wetsuit vereist (minimaal 4-5mm) + neopreen cap en handschoenen';
  if (tempCelsius < 16) return 'Wetsuit vereist (3-5mm) + zwemboei aanbevolen';
  if (tempCelsius < 20) return 'Wetsuit aanbevolen (2-3mm) voor langere sessies';
  return 'Zwemkleding volstaat (watertemperatuur >= 20°C)';
}

export async function syncSchoolVacations(
  db: SqliteDatabase,
  fetcher?: () => Promise<SchoolVacationItem[]>
): Promise<{ syncedCount: number }> {
  const items = fetcher
    ? await fetcher()
    : [
        {
          schoolYear: '2026-2027',
          vacationName: 'Herfstvakantie',
          region: 'noord' as const,
          startDate: '2026-10-17',
          endDate: '2026-10-25',
        },
        {
          schoolYear: '2026-2027',
          vacationName: 'Herfstvakantie',
          region: 'midden' as const,
          startDate: '2026-10-24',
          endDate: '2026-11-01',
        },
        {
          schoolYear: '2026-2027',
          vacationName: 'Herfstvakantie',
          region: 'zuid' as const,
          startDate: '2026-10-24',
          endDate: '2026-11-01',
        },
      ];

  const stmt = db.prepare(
    `INSERT INTO nl_school_vacations (
      id, school_year, vacation_name, region, start_date, end_date, scrape_trigger_date
    ) VALUES (@id, @schoolYear, @vacationName, @region, @startDate, @endDate, @scrapeTriggerDate)
    ON CONFLICT(id) DO UPDATE SET
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      scrape_trigger_date = excluded.scrape_trigger_date`
  );

  const insertMany = db.transaction((rows: SchoolVacationItem[]) => {
    for (const item of rows) {
      const id = `${item.schoolYear}-${item.vacationName.toLowerCase()}-${item.region}`;
      const scrapeTriggerDate = subtractDays(item.startDate, 14);
      stmt.run({
        id,
        schoolYear: item.schoolYear,
        vacationName: item.vacationName,
        region: item.region,
        startDate: item.startDate,
        endDate: item.endDate,
        scrapeTriggerDate,
      });
    }
  });

  insertMany(items);
  return { syncedCount: items.length };
}

export async function syncWeatherAlerts(
  db: SqliteDatabase,
  fetcher?: () => Promise<WeatherAlertItem[]>
): Promise<{ syncedCount: number }> {
  const items = fetcher ? await fetcher() : [];

  const deactivateStmt = db.prepare(
    `UPDATE weather_alerts SET is_active = 0 WHERE province_slug = ?`
  );

  const insertStmt = db.prepare(
    `INSERT INTO weather_alerts (
      id, province_slug, knmi_code, phenomenon, headline_nl, valid_from, valid_to, is_active, synced_at
    ) VALUES (@id, @provinceSlug, @knmiCode, @phenomenon, @headlineNl, @validFrom, @validTo, 1, @syncedAt)`
  );

  const nowIso = new Date().toISOString();

  const syncAll = db.transaction((alerts: WeatherAlertItem[]) => {
    for (const alert of alerts) {
      deactivateStmt.run(alert.provinceSlug);
      insertStmt.run({
        id: `alert-${crypto.randomUUID()}`,
        provinceSlug: alert.provinceSlug,
        knmiCode: alert.knmiCode,
        phenomenon: alert.phenomenon,
        headlineNl: alert.headlineNl,
        validFrom: alert.validFrom,
        validTo: alert.validTo,
        syncedAt: nowIso,
      });
    }
  });

  syncAll(items);
  return { syncedCount: items.length };
}

export async function syncOutdoorWaterConditions(
  db: SqliteDatabase,
  venueId: string,
  fetcher?: () => Promise<WaterConditionItem>
): Promise<WaterConditionResult> {
  const data = fetcher
    ? await fetcher()
    : {
        sourceAuthority: 'ZWEMWATER_NL' as const,
        waterTempCelsius: null,
        waterQualityState: 'CLEAN_APPROVED' as const,
        measuredAt: new Date().toISOString(),
      };

  const measuredAt = data.measuredAt ?? new Date().toISOString();
  const wetsuitAdviceNl = computeWetsuitAdvice(data.waterTempCelsius);
  const conditionId = `cond-${crypto.randomUUID()}`;

  db.transaction(() => {
    db.prepare(`UPDATE outdoor_conditions SET is_current = 0 WHERE venue_id = ?`).run(venueId);
    db.prepare(
      `INSERT INTO outdoor_conditions (
        id, venue_id, source_authority, water_temp_celsius, water_quality_state,
        wetsuit_advice_nl, measured_at, is_current
      ) VALUES (
        @id, @venueId, @sourceAuthority, @waterTempCelsius, @waterQualityState,
        @wetsuitAdviceNl, @measuredAt, 1
      )`
    ).run({
      id: conditionId,
      venueId,
      sourceAuthority: data.sourceAuthority,
      waterTempCelsius: data.waterTempCelsius,
      waterQualityState: data.waterQualityState,
      wetsuitAdviceNl,
      measuredAt,
    });
  })();

  return {
    conditionId,
    venueId,
    waterQualityState: data.waterQualityState,
    waterTempCelsius: data.waterTempCelsius,
    wetsuitAdviceNl,
  };
}
