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
