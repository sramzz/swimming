import { describe, it, expect } from 'vitest';
import { resolveVenueScheduleAndAlerts } from '@/machines/schedule-resolver';

describe('Dutch Calendar, School Vacation & KNMI Schedule Resolver FSM', () => {
  const baseInput = {
    todayIsoDate: '2026-10-20', // During Herfstvakantie Regio Noord (2026-10-17 .. 2026-10-25)
    isOutdoorOrOpenWater: false,
    vacationRegion: 'noord' as const,
    publicHolidayNameNl: null,
    activeVacationNameNl: 'Herfstvakantie',
    knmiAlert: null,
    outdoorWaterQualityState: 'CLEAN_APPROVED' as const,
    outdoorWaterTempCelsius: null,
    periods: [
      {
        id: 'reg-1',
        scheduleType: 'REGULAR_WINTER' as const,
        titleNl: 'Regulier Rooster',
        validFrom: '2026-09-01',
        validTo: '2027-06-30',
        priority: 10,
        verificationState: 'VERIFIED_PUBLISHED' as const,
      },
    ],
  };

  it('returns UNCONFIRMED_FALLBACK warning banner when in Schoolvakantie and no verified vacation period exists', () => {
    const res = resolveVenueScheduleAndAlerts(baseInput);
    expect(res.displayState).toBe('VACATION_UNCONFIRMED_FALLBACK');
    expect(res.activePeriodId).toBe('reg-1');
    expect(res.bannerNl).toContain('Herfstvakantie (Regio Noord)');
    expect(res.bannerNl).toContain('nog niet bevestigd');
  });

  it('switches to verified vacation roster when VERIFIED_PUBLISHED vacation period exists', () => {
    const res = resolveVenueScheduleAndAlerts({
      ...baseInput,
      periods: [
        ...baseInput.periods,
        {
          id: 'vac-herfst',
          scheduleType: 'SCHOOL_VACATION',
          titleNl: 'Herfstvakantierooster 2026',
          validFrom: '2026-10-17',
          validTo: '2026-10-25',
          priority: 50,
          verificationState: 'VERIFIED_PUBLISHED',
        },
      ],
    });
    expect(res.displayState).toBe('OPEN_VERIFIED_SPECIAL_SCHEDULE');
    expect(res.activePeriodId).toBe('vac-herfst');
    expect(res.bannerNl).toContain('Herfstvakantierooster 2026 is actief');
  });

  it('flags CLOSED_UNSAFE_WEATHER when KNMI Code Oranje is active for an outdoor/open-water venue', () => {
    const res = resolveVenueScheduleAndAlerts({
      ...baseInput,
      isOutdoorOrOpenWater: true,
      knmiAlert: { code: 'ORANJE', phenomenon: 'Onweer', headlineNl: 'Code Oranje: Zware onweersbuien' },
    });
    expect(res.displayState).toBe('CLOSED_UNSAFE_WEATHER');
    expect(res.bannerSeverity).toBe('CRITICAL');
    expect(res.bannerNl).toContain('KNMI Code Oranje');
  });

  it('surfaces an upcoming verified holiday schedule starting within 14 days', () => {
    const res = resolveVenueScheduleAndAlerts({
      ...baseInput,
      todayIsoDate: '2026-10-10', // 7 days before Herfstvakantie
      activeVacationNameNl: null,
      periods: [
        ...baseInput.periods,
        {
          id: 'vac-herfst',
          scheduleType: 'SCHOOL_VACATION',
          titleNl: 'Herfstvakantierooster 2026',
          validFrom: '2026-10-17',
          validTo: '2026-10-25',
          priority: 50,
          verificationState: 'VERIFIED_PUBLISHED',
        },
      ],
    });
    expect(res.displayState).toBe('OPEN_REGULAR');
    expect(res.upcomingSpecialPeriod?.id).toBe('vac-herfst');
  });
});
