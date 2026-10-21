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
