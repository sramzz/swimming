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
