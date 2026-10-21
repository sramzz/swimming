import { describe, it, expect } from 'vitest';
import { createDatabase, applyDetailedSchema } from '@/db/client';
import {
  syncSchoolVacations,
  syncWeatherAlerts,
  syncOutdoorWaterConditions,
} from '@/ingestion/open-apis';

describe('Dutch Open Data Syncers (Rijksoverheid, KNMI, Rijkswaterstaat/Zwemwater.nl)', () => {
  it('syncs Rijksoverheid school vacation windows into nl_school_vacations with 14-day scrape trigger', async () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);

    const mockVacationApi = async () => [
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
    ];

    const result = await syncSchoolVacations(db, mockVacationApi);
    expect(result.syncedCount).toBe(2);

    const rows = db.prepare('SELECT * FROM nl_school_vacations ORDER BY region ASC').all() as Array<{
      id: string;
      vacation_name: string;
      region: string;
      start_date: string;
      end_date: string;
      scrape_trigger_date: string;
    }>;

    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('2026-2027-herfstvakantie-midden');
    expect(rows[0].scrape_trigger_date).toBe('2026-10-10'); // 14 days before 2026-10-24
    expect(rows[1].id).toBe('2026-2027-herfstvakantie-noord');
    expect(rows[1].scrape_trigger_date).toBe('2026-10-03'); // 14 days before 2026-10-17

    db.close();
  });

  it('syncs KNMI weather alert for province and sets previous alert to inactive', async () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);

    const mockKnmiApi = async () => [
      {
        provinceSlug: 'noord-holland',
        knmiCode: 'ORANJE' as const,
        phenomenon: 'Onweer & zware windstoten',
        headlineNl: 'Code Oranje voor zware windstoten en onweer in Noord-Holland',
        validFrom: '2026-10-21T14:00:00Z',
        validTo: '2026-10-21T20:00:00Z',
      },
    ];

    const result = await syncWeatherAlerts(db, mockKnmiApi);
    expect(result.syncedCount).toBe(1);

    const activeAlerts = db
      .prepare('SELECT * FROM weather_alerts WHERE province_slug = ? AND is_active = 1')
      .all('noord-holland') as Array<{
        knmi_code: string;
        phenomenon: string;
        headline_nl: string;
      }>;

    expect(activeAlerts).toHaveLength(1);
    expect(activeAlerts[0].knmi_code).toBe('ORANJE');
    expect(activeAlerts[0].phenomenon).toBe('Onweer & zware windstoten');

    db.close();
  });

  it('syncs Rijkswaterstaat/Zwemwater.nl conditions for open-water venue', async () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);

    // Insert dummy municipality and venue
    db.prepare(
      `INSERT INTO municipalities (slug, cbs_code, name, province_slug, province_name, school_vacation_region, center_lat, center_lng)
       VALUES ('amsterdam', 'GM0363', 'Amsterdam', 'noord-holland', 'Noord-Holland', 'noord', 52.3676, 4.9041)`
    ).run();

    db.prepare(
      `INSERT INTO venues (id, slug, municipality_slug, name, venue_type, enrichment_tier, lat, lng)
       VALUES ('v-gaasperplas', 'gaasperplas', 'amsterdam', 'Gaasperplas', 'OPEN_WATER_NATURAL', 'GOLD_STANDARD', 52.3089, 4.9892)`
    ).run();

    const mockCondition = async () => ({
      sourceAuthority: 'ZWEMWATER_NL' as const,
      waterTempCelsius: 14.5,
      waterQualityState: 'WARNING_BLAUWALG' as const,
      measuredAt: '2026-10-21T10:00:00Z',
    });

    const res = await syncOutdoorWaterConditions(db, 'v-gaasperplas', mockCondition);
    expect(res.waterQualityState).toBe('WARNING_BLAUWALG');
    expect(res.wetsuitAdviceNl).toContain('Wetsuit vereist');

    const condition = db
      .prepare('SELECT * FROM outdoor_conditions WHERE venue_id = ? AND is_current = 1')
      .get('v-gaasperplas') as {
        water_temp_celsius: number;
        water_quality_state: string;
        wetsuit_advice_nl: string;
      };

    expect(condition.water_temp_celsius).toBe(14.5);
    expect(condition.water_quality_state).toBe('WARNING_BLAUWALG');

    db.close();
  });
});
