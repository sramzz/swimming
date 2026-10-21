import { useState } from 'preact/hooks';
import {
  createInitialStickyWidgetState,
  transitionStickyWidget,
  calculateTicketBreakdown,
} from '../../machines/sticky-widget-machine';
import { formatEuroCentsNl } from '../../domain/seo-aggregator';

export interface StickyWidgetProps {
  venueId: string;
  venueName: string;
  adultPriceCents: number;
  childPriceCents: number;
  tenPassPriceCents: number | null;
  officialTicketsUrl: string | null;
  officialZwemlesUrl: string | null;
  defaultPc4: string;
}

export default function StickyBookingWidgetIsland(props: StickyWidgetProps) {
  const [state, setState] = useState(createInitialStickyWidgetState);
  const [email, setEmail] = useState('');
  const [pc4, setPc4] = useState(props.defaultPc4 || '1079');
  const [childAge] = useState(4.5);
  const [prefersSalt, setPrefersSalt] = useState(true);

  const breakdown = calculateTicketBreakdown({
    adultsCount: state.adultsCount,
    childrenCount: state.childrenCount,
    adultPriceCents: props.adultPriceCents,
    childPriceCents: props.childPriceCents,
    tenPassPriceCents: props.tenPassPriceCents,
  });

  function handleWaitlistSubmit(e: Event) {
    e.preventDefault();
    const next = transitionStickyWidget(state, {
      type: 'SUBMIT_WAITLIST_FORM',
      payload: {
        parentEmail: email,
        postcodePc4: pc4,
        childAgeYears: childAge,
        diplomaTrack: 'DIPLOMA_A',
        prefersSaltWater: prefersSalt,
      },
    });
    setState(next);
    if (next.status === 'SUBMITTING_LEAD') {
      setState(transitionStickyWidget(next, { type: 'LEAD_SUBMIT_SUCCESS' }));
    }
  }

  return (
    <div class="p-6 bg-surface-pure rounded-2xl border border-border-hairline shadow-xl">
      <div class="grid grid-cols-2 gap-1 p-1 bg-surface-subtle rounded-xl mb-4 text-center text-xs font-bold">
        <button
          type="button"
          onClick={() => setState(transitionStickyWidget(state, { type: 'SWITCH_TAB', tab: 'CALCULATOR' }))}
          class={`py-2 rounded-lg transition-all ${
            state.status === 'TAB_CALCULATOR_IDLE'
              ? 'bg-surface-pure text-text-charcoal shadow-sm'
              : 'text-text-muted'
          }`}
        >
          Vrijzwemmen / Banen
        </button>
        <button
          type="button"
          onClick={() => setState(transitionStickyWidget(state, { type: 'SWITCH_TAB', tab: 'ZWEMLES' }))}
          class={`py-2 rounded-lg transition-all ${
            state.status !== 'TAB_CALCULATOR_IDLE'
              ? 'bg-surface-pure text-text-charcoal shadow-sm'
              : 'text-text-muted'
          }`}
        >
          Zwemles Wachttijd
        </button>
      </div>

      {state.status === 'TAB_CALCULATOR_IDLE' ? (
        <div class="space-y-4">
          <div class="flex items-center justify-between text-sm">
            <span>Volwassenen ({formatEuroCentsNl(props.adultPriceCents)})</span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="w-7 h-7 rounded-full border border-border-strong"
                onClick={() =>
                  setState(
                    transitionStickyWidget(state, {
                      type: 'SET_Counts',
                      adultsCount: state.adultsCount - 1,
                      childrenCount: state.childrenCount,
                    })
                  )
                }
              >
                -
              </button>
              <span class="font-bold w-4 text-center">{state.adultsCount}</span>
              <button
                type="button"
                class="w-7 h-7 rounded-full border border-border-strong"
                onClick={() =>
                  setState(
                    transitionStickyWidget(state, {
                      type: 'SET_Counts',
                      adultsCount: state.adultsCount + 1,
                      childrenCount: state.childrenCount,
                    })
                  )
                }
              >
                +
              </button>
            </div>
          </div>

          <div class="flex items-center justify-between text-sm">
            <span>Kinderen t/m 12 jr ({formatEuroCentsNl(props.childPriceCents)})</span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="w-7 h-7 rounded-full border border-border-strong"
                onClick={() =>
                  setState(
                    transitionStickyWidget(state, {
                      type: 'SET_Counts',
                      adultsCount: state.adultsCount,
                      childrenCount: state.childrenCount - 1,
                    })
                  )
                }
              >
                -
              </button>
              <span class="font-bold w-4 text-center">{state.childrenCount}</span>
              <button
                type="button"
                class="w-7 h-7 rounded-full border border-border-strong"
                onClick={() =>
                  setState(
                    transitionStickyWidget(state, {
                      type: 'SET_Counts',
                      adultsCount: state.adultsCount,
                      childrenCount: state.childrenCount + 1,
                    })
                  )
                }
              >
                +
              </button>
            </div>
          </div>

          <div class="pt-3 border-t border-border-hairline flex justify-between items-baseline">
            <span class="font-bold text-text-charcoal">Totaalbedrag</span>
            <span class="text-xl font-extrabold text-text-charcoal">
              {formatEuroCentsNl(breakdown.totalCents)}
            </span>
          </div>

          {breakdown.tenPassPerVisitCents && (
            <p class="text-xs text-emerald-800 bg-emerald-50 p-2.5 rounded-lg">
              Tip: Met een 10-badenkaart betaal je <strong>{formatEuroCentsNl(breakdown.tenPassPerVisitCents)}</strong> per bezoek ({breakdown.tenPassSavingsPercent}% besparing).
            </p>
          )}

          {props.officialTicketsUrl && (
            <a
              href={props.officialTicketsUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="w-full h-11 rounded-full bg-primary text-on-primary text-sm font-bold flex items-center justify-center shadow-sm"
            >
              Reserveer op officiële website ↗
            </a>
          )}
        </div>
      ) : (
        <form onSubmit={handleWaitlistSubmit} class="space-y-3 text-sm">
          <p class="text-xs text-text-muted">
            Ontvang direct de <strong>Top 3 zwemscholen met de kortste wachttijd</strong> rond jouw postcode (+ wachtlijst-alert).
          </p>
          <div>
            <label class="block text-xs font-bold mb-1">4-Cijferige Postcode (PC4)</label>
            <input
              type="text"
              maxLength={4}
              value={pc4}
              onInput={(e) => setPc4((e.target as HTMLInputElement).value)}
              class="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label class="block text-xs font-bold mb-1">E-mailadres ouder</label>
            <input
              type="email"
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              placeholder="ouder@voorbeeld.nl"
              class="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
            />
          </div>
          <label class="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={prefersSalt}
              onChange={(e) => setPrefersSalt((e.target as HTMLInputElement).checked)}
            />
            <span>Voorkeur voor zoutelektrolyse (zacht water)</span>
          </label>

          {state.errorMessageNl && (
            <p class="text-xs text-red-700 font-semibold">{state.errorMessageNl}</p>
          )}

          {state.status === 'LEAD_CONFIRMED_TOP3_SHOWN' ? (
            <div class="p-3 rounded-xl bg-badge-teal-bg text-primary text-xs font-bold">
              ✓ Vergelijking gereed! Bekijk hieronder de snelste startmogelijkheden in postcode {pc4}.
            </div>
          ) : (
            <button
              type="submit"
              class="w-full h-11 rounded-full bg-primary text-on-primary text-xs font-bold"
            >
              Vergelijk Kortste Wachttijden (Gratis)
            </button>
          )}
        </form>
      )}
    </div>
  );
}
