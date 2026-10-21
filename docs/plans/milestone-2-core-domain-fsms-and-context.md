# Milestone 2 Implementation Plan: Core Domain Engines & Finite State Machines

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement and unit-test all pure TypeScript Finite State Machines (FSMs) and domain logic engines—including the Dutch Holiday/School-Vacation/KNMI Schedule Resolver, Zero-Request Client Clock, Sticky Price Calculator & Lead Capture FSM, SEO Soft-404 Quality Gate + JSON-LD Builder, and Security-Hardened Affiliate Stub.

**Architecture:** All domain logic and state machines in `src/machines/` and `src/domain/` are 100% framework-agnostic, pure functions (Command-Query Separation) with zero DOM or network dependencies so they execute in `<10ms` in Vitest and can be shared across Astro static builds, Preact islands, and Cloudflare Workers.

**Tech Stack:** TypeScript, Vitest, Zod, Node `crypto`.

---

### Task 2.1: Build Dutch Context & Schedule Resolver FSM (`src/machines/schedule-resolver.ts`)

> **Why ([`To_remember.txt`](file:///Users/sramzzs4d/Projects-sramzz/swimming/To_remember.txt) & Spec 5.2):** Resolves whether a pool is operating on a normal schedule, an active *Feestdag*, a regional *Schoolvakantie* (`noord`, `midden`, `zuid`), or under a *KNMI Code Oranje/Rood* / *Blauwalg* warning—and surfaces upcoming holiday schedules up to 14 days in advance.

**Files:**
- Create: `src/machines/schedule-resolver.ts`
- Test: `tests/machines/schedule-resolver.test.ts`

- [ ] **Step 1: Write the failing test in `tests/machines/schedule-resolver.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/machines/schedule-resolver.test.ts`
Expected: FAIL (`Cannot find module '@/machines/schedule-resolver'`).

- [ ] **Step 3: Implement `src/machines/schedule-resolver.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/machines/schedule-resolver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit schedule resolver FSM**

```bash
git add src/machines/schedule-resolver.ts tests/machines/schedule-resolver.test.ts
git commit -m "feat(machines): add Dutch holiday, school vacation, and KNMI schedule resolver FSM"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 2.1 `[x]`:**
> 1. You observed `tests/machines/schedule-resolver.test.ts` **FAIL** in Step 2 before creating `src/machines/schedule-resolver.ts`.
> 2. `pnpm test tests/machines/schedule-resolver.test.ts` passes all 4 test cases (`VACATION_UNCONFIRMED_FALLBACK`, `OPEN_VERIFIED_SPECIAL_SCHEDULE`, `CLOSED_UNSAFE_WEATHER` on KNMI Code Oranje, and 14-day upcoming schedule detection).
> 3. Changes are committed and all checkboxes in Task 2.1 are marked `[x]`.

---

### Task 2.2: Build Zero-Request Client Clock & "Nu Open" Evaluator (`src/domain/open-status.ts`)

**Files:**
- Create: `src/domain/open-status.ts`
- Test: `tests/domain/open-status.test.ts`

- [ ] **Step 1: Write the failing test in `tests/domain/open-status.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { evaluateCurrentOpenStatus } from '@/domain/open-status';

describe('Zero-Request Client Clock Open Status Evaluator', () => {
  const slots = [
    { day_of_week: 3, activity_type: 'BANENZWEMMEN', label_nl: 'Vroege Vogel Banen', start_time: '07:00', end_time: '09:30' },
    { day_of_week: 3, activity_type: 'BANENZWEMMEN', label_nl: 'Avond Banenzwemmen', start_time: '19:00', end_time: '22:00' },
  ];

  it('detects OPEN_NOW when current time falls within an active slot', () => {
    const status = evaluateCurrentOpenStatus(slots, { isoDayOfWeek: 3, currentTimeHHMM: '20:15' });
    expect(status.state).toBe('OPEN_NOW');
    expect(status.activeSlot?.label_nl).toBe('Avond Banenzwemmen');
    expect(status.badgeNl).toBe('Nu Open: Avond Banenzwemmen (tot 22:00)');
  });

  it('detects OPENING_LATER_TODAY when a slot starts later on the same day', () => {
    const status = evaluateCurrentOpenStatus(slots, { isoDayOfWeek: 3, currentTimeHHMM: '14:00' });
    expect(status.state).toBe('OPENING_LATER_TODAY');
    expect(status.nextSlotToday?.start_time).toBe('19:00');
    expect(status.badgeNl).toBe('Straks open om 19:00 (Avond Banenzwemmen)');
  });

  it('detects CLOSED_FOR_TODAY after all slots have ended', () => {
    const status = evaluateCurrentOpenStatus(slots, { isoDayOfWeek: 3, currentTimeHHMM: '22:30' });
    expect(status.state).toBe('CLOSED_FOR_TODAY');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/domain/open-status.test.ts`
Expected: FAIL (`Cannot find module '@/domain/open-status'`).

- [ ] **Step 3: Implement `src/domain/open-status.ts`**

```typescript
export interface SimpleSlot {
  day_of_week: number;
  activity_type: string;
  label_nl: string;
  start_time: string;
  end_time: string;
}

export interface ClockContext {
  isoDayOfWeek: number; // 1 = Monday .. 7 = Sunday
  currentTimeHHMM: string; // 'HH:MM' in Europe/Amsterdam
}

export interface OpenStatusEvaluation {
  state: 'OPEN_NOW' | 'OPENING_LATER_TODAY' | 'CLOSED_FOR_TODAY';
  activeSlot: SimpleSlot | null;
  nextSlotToday: SimpleSlot | null;
  badgeNl: string;
}

export function getAmsterdamClockContext(now = new Date()): ClockContext {
  const formatter = new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekdayMap: Record<string, number> = {
    ma: 1, di: 2, wo: 3, do: 4, vr: 5, za: 6, zo: 7,
  };
  const weekdayStr = (parts.find((p) => p.type === 'weekday')?.value ?? 'ma').toLowerCase().slice(0, 2);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '12';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';

  return {
    isoDayOfWeek: weekdayMap[weekdayStr] ?? 1,
    currentTimeHHMM: `${hour}:${minute}`,
  };
}

export function evaluateCurrentOpenStatus(
  slots: SimpleSlot[],
  clock: ClockContext = getAmsterdamClockContext()
): OpenStatusEvaluation {
  const todaySlots = slots
    .filter((s) => s.day_of_week === clock.isoDayOfWeek)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const activeSlot =
    todaySlots.find(
      (s) => s.start_time <= clock.currentTimeHHMM && clock.currentTimeHHMM < s.end_time
    ) ?? null;

  if (activeSlot) {
    return {
      state: 'OPEN_NOW',
      activeSlot,
      nextSlotToday: null,
      badgeNl: `Nu Open: ${activeSlot.label_nl} (tot ${activeSlot.end_time})`,
    };
  }

  const nextSlotToday =
    todaySlots.find((s) => s.start_time > clock.currentTimeHHMM) ?? null;

  if (nextSlotToday) {
    return {
      state: 'OPENING_LATER_TODAY',
      activeSlot: null,
      nextSlotToday,
      badgeNl: `Straks open om ${nextSlotToday.start_time} (${nextSlotToday.label_nl})`,
    };
  }

  return {
    state: 'CLOSED_FOR_TODAY',
    activeSlot: null,
    nextSlotToday: null,
    badgeNl: 'Vandaag gesloten',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/domain/open-status.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit open-status evaluator**

```bash
git add src/domain/open-status.ts tests/domain/open-status.test.ts
git commit -m "feat(domain): add zero-request Europe/Amsterdam open status evaluator"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 2.2 `[x]`:**
> 1. You observed `tests/domain/open-status.test.ts` **FAIL** in Step 2 before creating `src/domain/open-status.ts`.
> 2. `pnpm test tests/domain/open-status.test.ts` passes all 3 test cases (`OPEN_NOW`, `OPENING_LATER_TODAY`, `CLOSED_FOR_TODAY`).
> 3. Zero network calls are made; timezone resolution explicitly uses `Europe/Amsterdam`.
> 4. Changes are committed and all checkboxes in Task 2.2 are marked `[x]`.

---

### Task 2.3: Build Sticky Price Calculator & Lead Capture FSM (`src/machines/sticky-widget-machine.ts`)

> **Why (Spec 5.1):** Models the 2-tab sticky widget on the Facility Detail page (Tab 1: Family/Group Price Calculator + *10-Badenkaart* comparison + outbound official ticket link; Tab 2: Day-1 *Kortste Wachttijd Vergelijker & Alert* form with deterministic `idempotency_key`).

**Files:**
- Create: `src/machines/sticky-widget-machine.ts`
- Test: `tests/machines/sticky-widget-machine.test.ts`

- [ ] **Step 1: Write the failing test in `tests/machines/sticky-widget-machine.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  createInitialStickyWidgetState,
  transitionStickyWidget,
  calculateTicketBreakdown,
  buildLeadIdempotencyKey,
} from '@/machines/sticky-widget-machine';

describe('Sticky Price Calculator & Lead Capture FSM', () => {
  it('calculates family admission total and 10-badenkaart savings accurately', () => {
    const breakdown = calculateTicketBreakdown({
      adultsCount: 1,
      childrenCount: 1,
      adultPriceCents: 820,
      childPriceCents: 650,
      tenPassPriceCents: 7400,
    });
    expect(breakdown.totalCents).toBe(1470); // € 14,70 matching mockup!
    expect(breakdown.tenPassPerVisitCents).toBe(740);
    expect(breakdown.tenPassSavingsPercent).toBe(10);
  });

  it('enforces valid FSM transitions and blocks invalid input before SUBMITTING_LEAD', () => {
    let state = createInitialStickyWidgetState();
    expect(state.status).toBe('TAB_CALCULATOR_IDLE');

    state = transitionStickyWidget(state, { type: 'SWITCH_TAB', tab: 'ZWEMLES' });
    expect(state.status).toBe('TAB_ZWEMLES_IDLE');

    // Submit with invalid PC4
    state = transitionStickyWidget(state, {
      type: 'SUBMIT_WAITLIST_FORM',
      payload: {
        parentEmail: 'sanne@example.nl',
        postcodePc4: '99',
        childAgeYears: 4.5,
        diplomaTrack: 'DIPLOMA_A',
        prefersSaltWater: true,
      },
    });
    expect(state.status).toBe('TAB_ZWEMLES_VALIDATION_ERROR');

    // Submit with valid fields
    state = transitionStickyWidget(state, {
      type: 'SUBMIT_WAITLIST_FORM',
      payload: {
        parentEmail: 'sanne@example.nl',
        postcodePc4: '1079',
        childAgeYears: 4.5,
        diplomaTrack: 'DIPLOMA_A',
        prefersSaltWater: true,
      },
    });
    expect(state.status).toBe('SUBMITTING_LEAD');
    expect(state.idempotencyKey).toBe(
      buildLeadIdempotencyKey('sanne@example.nl', '1079', 'DIPLOMA_A', '2026-10-21')
    );

    // Transition to confirmed
    state = transitionStickyWidget(state, { type: 'LEAD_SUBMIT_SUCCESS' });
    expect(state.status).toBe('LEAD_CONFIRMED_TOP3_SHOWN');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/machines/sticky-widget-machine.test.ts`
Expected: FAIL (`Cannot find module '@/machines/sticky-widget-machine'`).

- [ ] **Step 3: Implement `src/machines/sticky-widget-machine.ts`**

```typescript
import crypto from 'node:crypto';
import { z } from 'zod';

export const WaitlistLeadInputSchema = z.object({
  parentEmail: z.string().email(),
  postcodePc4: z.string().regex(/^[1-9][0-9]{3}$/, 'Voer een geldige 4-cijferige postcode in (bijv. 1079)'),
  childAgeYears: z.number().min(0.5).max(16),
  diplomaTrack: z.enum([
    'WATERGEWENNING',
    'DIPLOMA_A',
    'DIPLOMA_B',
    'DIPLOMA_C',
    'ABC_COMPLETE_PACKAGE',
    'TURBO_SNELCURSUS',
    'PRIVATE_OR_LOW_STIMULUS',
  ]),
  prefersSaltWater: z.boolean(),
});

export type WaitlistLeadInput = z.infer<typeof WaitlistLeadInputSchema>;

export type StickyWidgetStatus =
  | 'TAB_CALCULATOR_IDLE'
  | 'TAB_ZWEMLES_IDLE'
  | 'TAB_ZWEMLES_VALIDATION_ERROR'
  | 'SUBMITTING_LEAD'
  | 'LEAD_CONFIRMED_TOP3_SHOWN'
  | 'LEAD_ERROR_RETRYABLE';

export interface StickyWidgetState {
  status: StickyWidgetStatus;
  adultsCount: number;
  childrenCount: number;
  errorMessageNl: string | null;
  idempotencyKey: string | null;
}

export type StickyWidgetEvent =
  | { type: 'SWITCH_TAB'; tab: 'CALCULATOR' | 'ZWEMLES' }
  | { type: 'SET_Counts'; adultsCount: number; childrenCount: number }
  | { type: 'SUBMIT_WAITLIST_FORM'; payload: WaitlistLeadInput; dateBucket?: string }
  | { type: 'LEAD_SUBMIT_SUCCESS' }
  | { type: 'LEAD_SUBMIT_FAILURE'; errorMessageNl: string };

export interface TicketBreakdownInput {
  adultsCount: number;
  childrenCount: number;
  adultPriceCents: number;
  childPriceCents: number;
  tenPassPriceCents: number | null;
}

export interface TicketBreakdownResult {
  adultsSubtotalCents: number;
  childrenSubtotalCents: number;
  totalCents: number;
  tenPassPerVisitCents: number | null;
  tenPassSavingsPercent: number | null;
}

export function calculateTicketBreakdown(input: TicketBreakdownInput): TicketBreakdownResult {
  const adultsSubtotalCents = Math.max(0, input.adultsCount) * input.adultPriceCents;
  const childrenSubtotalCents = Math.max(0, input.childrenCount) * input.childPriceCents;
  const totalCents = adultsSubtotalCents + childrenSubtotalCents;

  const tenPassPerVisitCents =
    input.tenPassPriceCents !== null ? Math.round(input.tenPassPriceCents / 10) : null;
  const tenPassSavingsPercent =
    tenPassPerVisitCents !== null && input.adultPriceCents > 0
      ? Math.round(((input.adultPriceCents - tenPassPerVisitCents) / input.adultPriceCents) * 100)
      : null;

  return {
    adultsSubtotalCents,
    childrenSubtotalCents,
    totalCents,
    tenPassPerVisitCents,
    tenPassSavingsPercent,
  };
}

export function buildLeadIdempotencyKey(
  email: string,
  pc4: string,
  diplomaTrack: string,
  dateBucket = '2026-10-21'
): string {
  const normalized = `${email.trim().toLowerCase()}|${pc4.trim()}|${diplomaTrack}|${dateBucket}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function createInitialStickyWidgetState(): StickyWidgetState {
  return {
    status: 'TAB_CALCULATOR_IDLE',
    adultsCount: 1,
    childrenCount: 1,
    errorMessageNl: null,
    idempotencyKey: null,
  };
}

export function transitionStickyWidget(
  state: StickyWidgetState,
  event: StickyWidgetEvent
): StickyWidgetState {
  switch (event.type) {
    case 'SWITCH_TAB':
      return {
        ...state,
        status: event.tab === 'CALCULATOR' ? 'TAB_CALCULATOR_IDLE' : 'TAB_ZWEMLES_IDLE',
        errorMessageNl: null,
      };

    case 'SET_Counts':
      return {
        ...state,
        adultsCount: Math.max(0, Math.min(20, event.adultsCount)),
        childrenCount: Math.max(0, Math.min(20, event.childrenCount)),
      };

    case 'SUBMIT_WAITLIST_FORM': {
      if (state.status === 'SUBMITTING_LEAD' || state.status === 'LEAD_CONFIRMED_TOP3_SHOWN') {
        return state; // Prevent double-submit race conditions
      }
      const parsed = WaitlistLeadInputSchema.safeParse(event.payload);
      if (!parsed.success) {
        return {
          ...state,
          status: 'TAB_ZWEMLES_VALIDATION_ERROR',
          errorMessageNl: parsed.error.issues[0]?.message ?? 'Controleer de ingevulde velden.',
        };
      }
      const key = buildLeadIdempotencyKey(
        parsed.data.parentEmail,
        parsed.data.postcodePc4,
        parsed.data.diplomaTrack,
        event.dateBucket ?? '2026-10-21'
      );
      return {
        ...state,
        status: 'SUBMITTING_LEAD',
        errorMessageNl: null,
        idempotencyKey: key,
      };
    }

    case 'LEAD_SUBMIT_SUCCESS':
      if (state.status !== 'SUBMITTING_LEAD') return state;
      return {
        ...state,
        status: 'LEAD_CONFIRMED_TOP3_SHOWN',
        errorMessageNl: null,
      };

    case 'LEAD_SUBMIT_FAILURE':
      if (state.status !== 'SUBMITTING_LEAD') return state;
      return {
        ...state,
        status: 'LEAD_ERROR_RETRYABLE',
        errorMessageNl: event.errorMessageNl,
      };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/machines/sticky-widget-machine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit sticky widget FSM**

```bash
git add src/machines/sticky-widget-machine.ts tests/machines/sticky-widget-machine.test.ts
git commit -m "feat(machines): add sticky price calculator and waitlist lead FSM"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 2.3 `[x]`:**
> 1. You observed `tests/machines/sticky-widget-machine.test.ts` **FAIL** in Step 2 before creating `src/machines/sticky-widget-machine.ts`.
> 2. `pnpm test tests/machines/sticky-widget-machine.test.ts` passes (`1470` cents family total, `10%` 10-pass savings, invalid PC4 `99` blocked in `TAB_ZWEMLES_VALIDATION_ERROR`, deterministic SHA-256 `idempotencyKey` generated).
> 3. Changes are committed and all checkboxes in Task 2.3 are marked `[x]`.

---

### Task 2.4: Build Programmatic SEO Quality Gate, City Summary & JSON-LD Builder (`src/domain/seo-aggregator.ts`)

**Files:**
- Create: `src/domain/seo-aggregator.ts`
- Test: `tests/domain/seo-aggregator.test.ts`

- [ ] **Step 1: Write the failing test in `tests/domain/seo-aggregator.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  shouldGenerateIndexableFacetPage,
  buildCitySeoSummaryNl,
  buildVenueJsonLd,
} from '@/domain/seo-aggregator';

describe('Programmatic SEO Quality Gate & Structured Data Builder', () => {
  it('blocks Soft-404 generation when matching venue count is 0', () => {
    expect(shouldGenerateIndexableFacetPage(0)).toBe(false);
    expect(shouldGenerateIndexableFacetPage(1)).toBe(true);
  });

  it('generates rich Dutch city summary facts for featured snippets', () => {
    const summary = buildCitySeoSummaryNl({
      cityName: 'Amsterdam',
      totalVenues: 4,
      saltWaterCount: 2,
      cheapestSinglePriceCents: 650,
      cheapestVenueName: 'Sportfondsenbad Amsterdam-Oost',
      shortestWaitlistWeeks: 4,
    });
    expect(summary).toContain('In Amsterdam zijn er 4 zwemlocaties');
    expect(summary).toContain('€ 6,50 bij Sportfondsenbad Amsterdam-Oost');
    expect(summary).toContain('2 zwembaden met huidvriendelijke zoutelektrolyse');
    expect(summary).toContain('4 weken');
  });

  it('builds valid Schema.org SportsActivityLocation JSON-LD', () => {
    const ld = buildVenueJsonLd({
      name: 'Zwemcentrum De Mirandabad',
      slug: 'de-mirandabad',
      citySlug: 'amsterdam',
      cityName: 'Amsterdam',
      streetAddress: 'De Mirandalaan 9',
      postcode: '1079 PA',
      lat: 52.3387,
      lng: 4.9021,
      ratingScore: 4.92,
      ratingCount: 312,
      minPriceCents: 820,
      waterTreatment: 'SALT_ELECTROLYSIS',
    });

    expect(ld['@type']).toBe('PublicSwimmingPool');
    expect(ld.url).toBe('https://allezwembaden.nl/zwembad/amsterdam/de-mirandabad');
    expect(ld.aggregateRating.ratingValue).toBe(4.92);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/domain/seo-aggregator.test.ts`
Expected: FAIL (`Cannot find module '@/domain/seo-aggregator'`).

- [ ] **Step 3: Implement `src/domain/seo-aggregator.ts`**

```typescript
export function shouldGenerateIndexableFacetPage(matchingVenuesCount: number): boolean {
  return matchingVenuesCount >= 1;
}

export function formatEuroCentsNl(cents: number): string {
  return `€ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

export interface CitySeoSummaryInput {
  cityName: string;
  totalVenues: number;
  saltWaterCount: number;
  cheapestSinglePriceCents: number | null;
  cheapestVenueName: string | null;
  shortestWaitlistWeeks: number | null;
}

export function buildCitySeoSummaryNl(input: CitySeoSummaryInput): string {
  const parts: string[] = [
    `In ${input.cityName} zijn er ${input.totalVenues} zwemlocaties (waaronder ${input.saltWaterCount} zwembaden met huidvriendelijke zoutelektrolyse).`,
  ];

  if (input.cheapestSinglePriceCents !== null && input.cheapestVenueName) {
    parts.push(
      `Een los entreekaartje begint vanaf ${formatEuroCentsNl(input.cheapestSinglePriceCents)} bij ${input.cheapestVenueName}.`
    );
  }

  if (input.shortestWaitlistWeeks !== null) {
    parts.push(
      `De kortste wachttijd voor Zwemdiploma A in ${input.cityName} bedraagt momenteel circa ${input.shortestWaitlistWeeks} weken.`
    );
  }

  return parts.join(' ');
}

export interface VenueJsonLdInput {
  name: string;
  slug: string;
  citySlug: string;
  cityName: string;
  streetAddress: string | null;
  postcode: string | null;
  lat: number;
  lng: number;
  ratingScore: number | null;
  ratingCount: number;
  minPriceCents: number | null;
  waterTreatment: string;
}

export function buildVenueJsonLd(input: VenueJsonLdInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'PublicSwimmingPool',
    name: input.name,
    url: `https://allezwembaden.nl/zwembad/${input.citySlug}/${input.slug}`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: input.streetAddress ?? undefined,
      postalCode: input.postcode ?? undefined,
      addressLocality: input.cityName,
      addressCountry: 'NL',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: input.lat,
      longitude: input.lng,
    },
    amenityFeature: [
      {
        '@type': 'LocationFeatureSpecification',
        name: 'Waterbehandeling',
        value: input.waterTreatment === 'SALT_ELECTROLYSIS' ? 'Zoutelektrolyse' : 'Chloor / Natuurwater',
      },
    ],
    ...(input.ratingScore !== null && input.ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: input.ratingScore,
            reviewCount: input.ratingCount,
            bestRating: 5,
          },
        }
      : {}),
    ...(input.minPriceCents !== null
      ? {
          offers: {
            '@type': 'Offer',
            priceCurrency: 'EUR',
            price: (input.minPriceCents / 100).toFixed(2),
          },
        }
      : {}),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/domain/seo-aggregator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit SEO aggregator**

```bash
git add src/domain/seo-aggregator.ts tests/domain/seo-aggregator.test.ts
git commit -m "feat(domain): add Soft-404 quality gate, Dutch city summaries, and JSON-LD builder"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 2.4 `[x]`:**
> 1. You observed `tests/domain/seo-aggregator.test.ts` **FAIL** in Step 2 before creating `src/domain/seo-aggregator.ts`.
> 2. `pnpm test tests/domain/seo-aggregator.test.ts` passes (`shouldGenerateIndexableFacetPage(0) === false`, Dutch summary facts, and `PublicSwimmingPool` JSON-LD).
> 3. Changes are committed and all checkboxes in Task 2.4 are marked `[x]`.

---

### Task 2.5: Build Security-Hardened Affiliate Gear Stub (`src/domain/affiliate-stub.ts`)

> **Why (Decision 4D):** Keeps the affiliate slot disabled by default (`is_enabled = 0`) and resolves strictly against allowlisted slugs in SQLite/D1 so open-redirect vulnerabilities are impossible.

**Files:**
- Create: `src/domain/affiliate-stub.ts`
- Test: `tests/domain/affiliate-stub.test.ts`

- [ ] **Step 1: Write the failing test in `tests/domain/affiliate-stub.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { createDatabase, applyDetailedSchema } from '@/db/client';
import { seedInitialDataset } from '@/db/seed';
import { resolveSafeAffiliateStubRedirect } from '@/domain/affiliate-stub';

describe('Security-Hardened Affiliate Stub', () => {
  it('returns null when stub is disabled (default at launch) or when an unknown/malicious slug is passed', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);
    seedInitialDataset(db);

    // Disabled by default
    expect(resolveSafeAffiliateStubRedirect(db, 'neopreen-wetsuit-4mm')).toBeNull();
    // Arbitrary URL injection attempt
    expect(resolveSafeAffiliateStubRedirect(db, 'https://evil.example.com')).toBeNull();

    // Enable the stub explicitly and verify safe resolution
    db.prepare("UPDATE affiliate_product_stubs SET is_enabled = 1 WHERE slug = 'neopreen-wetsuit-4mm'").run();
    const resolved = resolveSafeAffiliateStubRedirect(db, 'neopreen-wetsuit-4mm');
    expect(resolved?.target_url).toBe('https://allezwembaden.nl/#wetsuit-stub');

    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/domain/affiliate-stub.test.ts`
Expected: FAIL (`Cannot find module '@/domain/affiliate-stub'`).

- [ ] **Step 3: Implement `src/domain/affiliate-stub.ts`**

```typescript
import type { SqliteDatabase } from '../db/client';

const SAFE_SLUG_REGEX = /^[a-z0-9-]{2,64}$/;

export interface AffiliateStubItem {
  slug: string;
  context_rule: string;
  title_nl: string;
  target_url: string;
}

export function resolveSafeAffiliateStubRedirect(
  db: SqliteDatabase,
  slug: string
): AffiliateStubItem | null {
  if (!SAFE_SLUG_REGEX.test(slug)) {
    return null;
  }

  const row = db
    .prepare(
      'SELECT slug, context_rule, title_nl, target_url FROM affiliate_product_stubs WHERE slug = ? AND is_enabled = 1'
    )
    .get(slug) as AffiliateStubItem | undefined;

  return row ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/domain/affiliate-stub.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit affiliate stub**

```bash
git add src/domain/affiliate-stub.ts tests/domain/affiliate-stub.test.ts
git commit -m "feat(domain): add allowlist-only disabled-by-default affiliate stub"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 2.5 `[x]`:**
> 1. You observed `tests/domain/affiliate-stub.test.ts` **FAIL** in Step 2 before creating `src/domain/affiliate-stub.ts`.
> 2. `pnpm test tests/domain/affiliate-stub.test.ts` passes (disabled-by-default returns `null`, URL injection attempt returns `null`, enabled slug resolves strictly from SQLite).
> 3. Changes are committed and all checkboxes in Task 2.5 are marked `[x]`.

---

## 🛑 Milestone 2 Verification Gate (Check All Before Starting Milestone 3!)

- [ ] `pnpm test` passes 100% of Milestone 1 + Milestone 2 unit tests (`schedule-resolver`, `open-status`, `sticky-widget-machine`, `seo-aggregator`, `affiliate-stub`).
- [ ] Every FSM rejects invalid transitions and produces deterministic outputs.
