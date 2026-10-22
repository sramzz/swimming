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
  let h1 = 0xdeadbeef ^ normalized.length;
  let h2 = 0x41c6ce57 ^ normalized.length;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex =
    (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  return `idem-${dateBucket}-${pc4.trim()}-${hex}`;
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
