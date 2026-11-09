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
  officialWebsiteUrl?: string | null;
  officialZwemlesUrl: string | null;
  googleMapsRouteUrl?: string | null;
  defaultPc4: string;
  ratingScore?: number | null;
  ratingCount?: number;
  primaryWaterTreatment?: string;
  isOpenWater?: boolean;
  isPaidAccess?: boolean;
  infoBoardUrl?: string | null;
  waterProfileUrl?: string | null;
  waterQualityClassNl?: string | null;
  seasonTextNl?: string | null;
}

interface RecommendedSchool {
  venue_name: string;
  provider_name: string;
  current_waitlist_weeks_min: number;
  current_waitlist_weeks_max: number;
  monthly_price_cents: number;
}

export default function StickyBookingWidgetIsland(props: StickyWidgetProps) {
  const [state, setState] = useState(createInitialStickyWidgetState);
  const [email, setEmail] = useState('');
  const [pc4, setPc4] = useState(props.defaultPc4 || '1079');
  const [childAge] = useState(4.5);
  const [prefersSalt, setPrefersSalt] = useState(true);
  const [recommendations, setRecommendations] = useState<RecommendedSchool[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('Vandaag, 14:00 - 16:30');
  const [visitorPickerOpen, setVisitorPickerOpen] = useState(true);

  const outboundTicketUrl = props.officialTicketsUrl || props.officialWebsiteUrl || null;

  const breakdown = calculateTicketBreakdown({
    adultsCount: state.adultsCount,
    childrenCount: state.childrenCount,
    adultPriceCents: props.adultPriceCents,
    childPriceCents: props.childPriceCents,
    tenPassPriceCents: props.tenPassPriceCents,
  });

  function handleOfficialTicketClick() {
    try {
      fetch('/api/clicks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venueId: props.venueId,
          clickTargetType: 'OFFICIAL_TICKETS_CALCULATOR',
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Fire-and-forget
    }
  }

  async function handleWaitlistSubmit(e: Event) {
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
    if (next.status !== 'SUBMITTING_LEAD') return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentEmail: email,
          postcodePc4: pc4,
          childAgeYears: childAge,
          diplomaTrack: 'DIPLOMA_A',
          prefersSaltWater: prefersSalt,
        }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        errorMessageNl?: string;
        topRecommendations?: RecommendedSchool[];
      };

      if (res.ok && data.ok) {
        setRecommendations(data.topRecommendations ?? []);
        setState(transitionStickyWidget(next, { type: 'LEAD_SUBMIT_SUCCESS' }));
      } else {
        setState({
          ...next,
          status: 'TAB_ZWEMLES_IDLE',
          errorMessageNl: data.errorMessageNl || 'Er ging iets mis bij het opslaan. Controleer de velden.',
        });
      }
    } catch {
      setState(transitionStickyWidget(next, { type: 'LEAD_SUBMIT_SUCCESS' }));
    } finally {
      setIsSubmitting(false);
    }
  }

  // Dedicated Open-Water Zwemwater.nl Dossier & Informatiebord Mode (No fake €0.00 cart!)
  if (props.isOpenWater) {
    return (
      <div class="p-6 bg-surface-pure rounded-2xl border border-border-hairline shadow-xl space-y-4">
        <div class="pb-4 border-b border-border-hairline flex items-start justify-between gap-2">
          <div>
            <span class="text-2xl font-extrabold text-text-charcoal block">
              {props.isPaidAccess ? 'Betaald terrein' : 'Gratis toegang'}
            </span>
            <span class="text-xs text-text-muted block mt-0.5">
              {props.isPaidAccess
                ? 'Semi-openbaar of betaald recreatieterrein'
                : 'Officiële openbare Rijkswaterstaat / Provincie zwemplek'}
            </span>
          </div>
          <span class="px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-900 border border-cyan-200 text-[11px] font-bold">
            🌊 Natuurwater
          </span>
        </div>

        <div class="p-3.5 rounded-xl bg-badge-teal-bg/60 border border-primary/20 space-y-2 text-xs">
          <div class="flex items-center justify-between">
            <span class="text-text-muted font-medium">EU 4-jaars kwaliteitsklasse:</span>
            <span class="font-extrabold text-primary capitalize">
              {props.waterQualityClassNl || 'Gecontroleerd'}
            </span>
          </div>
          {props.seasonTextNl && (
            <div class="flex items-center justify-between">
              <span class="text-text-muted font-medium">Bewaakt seizoen:</span>
              <span class="font-bold text-text-charcoal">1 mei – 30 sept</span>
            </div>
          )}
        </div>

        <div class="space-y-2.5 pt-1">
          {props.infoBoardUrl && (
            <a
              href={props.infoBoardUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="w-full h-11 rounded-full bg-primary hover:bg-primary-container text-on-primary text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              <span>📋 Bekijk Officieel Informatiebord</span>
              <span>↗</span>
            </a>
          )}

          {props.waterProfileUrl && (
            <a
              href={props.waterProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="w-full h-11 rounded-full bg-surface-subtle hover:bg-surface-container text-text-charcoal border border-border-strong text-xs font-bold flex items-center justify-center gap-2 transition-all"
            >
              <span>📄 Officieel Zwemwaterprofiel (PDF)</span>
              <span>↗</span>
            </a>
          )}

          {outboundTicketUrl && (
            <a
              href={outboundTicketUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleOfficialTicketClick}
              class="w-full h-11 rounded-full bg-text-charcoal hover:bg-black text-surface-pure text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              <span>🌊 Bekijk op Zwemwater.nl</span>
              <span>↗</span>
            </a>
          )}

          {props.googleMapsRouteUrl && (
            <a
              href={props.googleMapsRouteUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="w-full h-10 rounded-full border border-border-hairline hover:border-text-charcoal text-text-charcoal text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
            >
              <span>📍 Plan route in Google Maps</span>
              <span>↗</span>
            </a>
          )}
        </div>

        <div class="pt-3 border-t border-border-hairline space-y-1.5 text-[11px] text-text-muted">
          <div class="flex items-center gap-2">
            <span class="text-primary font-bold">✓</span>
            <span>Gegevens gesynchroniseerd met Rijkswaterstaat &amp; Zwemwater.nl</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-primary font-bold">✓</span>
            <span>Controleer voor vertrek altijd het informatiebord ter plaatse</span>
          </div>
        </div>
      </div>
    );
  }

  const isSalt = props.primaryWaterTreatment === 'SALT_ELECTROLYSIS';

  return (
    <div class="p-6 bg-surface-pure rounded-2xl border border-border-hairline shadow-xl">
      {/* Pricing & Rating Header (Photo 4) */}
      <div class="flex items-baseline justify-between pb-4 border-b border-border-hairline">
        <div>
          <span class="text-2xl font-extrabold text-text-charcoal">
            {props.adultPriceCents === 0 ? 'Gratis toegang' : `Vanaf ${formatEuroCentsNl(props.adultPriceCents)}`}
          </span>
          <span class="text-xs text-text-muted block mt-0.5">per losse entree</span>
        </div>
        {props.ratingScore && (
          <div class="flex items-center text-xs">
            <span class="text-amber-500 mr-1">★</span>
            <span class="font-bold text-text-charcoal">{props.ratingScore.toFixed(2)}</span>
            {props.ratingCount !== undefined && (
              <span class="text-text-muted ml-1">({props.ratingCount})</span>
            )}
          </div>
        )}
      </div>

      {/* Green Water Treatment Callout Banner (Photo 4) */}
      {isSalt ? (
        <div class="mt-3 py-2.5 px-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-900 font-medium">
          <span class="text-emerald-600 shrink-0 text-sm">💧</span>
          <span>
            Waterbehandeling: <strong class="font-bold">Zoutelektrolyse</strong> (ideaal voor gevoelige huid en allergieën)
          </span>
        </div>
      ) : (
        <div class="mt-3 py-2.5 px-3 rounded-xl bg-badge-teal-bg/70 border border-primary/20 flex items-center gap-2 text-xs text-primary font-medium">
          <span class="shrink-0 text-sm">✓</span>
          <span>
            Waterkwaliteit: <strong class="font-bold">Gecontroleerd Zwemwater</strong> volgens keurmerk
          </span>
        </div>
      )}

      {/* Segmented Tab Picker (Photo 4) */}
      <div class="grid grid-cols-2 gap-1 p-1 bg-surface-subtle rounded-xl mt-4 mb-4 text-center text-xs font-bold">
        <button
          type="button"
          onClick={() => setState(transitionStickyWidget(state, { type: 'SWITCH_TAB', tab: 'CALCULATOR' }))}
          class={`py-2 rounded-lg transition-all cursor-pointer ${
            state.status === 'TAB_CALCULATOR_IDLE'
              ? 'bg-surface-pure text-text-charcoal shadow-xs'
              : 'text-text-muted hover:text-text-charcoal'
          }`}
        >
          Vrijzwemmen / Banen
        </button>
        <button
          type="button"
          onClick={() => setState(transitionStickyWidget(state, { type: 'SWITCH_TAB', tab: 'ZWEMLES' }))}
          class={`py-2 rounded-lg transition-all cursor-pointer ${
            state.status !== 'TAB_CALCULATOR_IDLE'
              ? 'bg-surface-pure text-text-charcoal shadow-xs'
              : 'text-text-muted hover:text-text-charcoal'
          }`}
        >
          Zwemles Aanvraag
        </button>
      </div>

      {state.status === 'TAB_CALCULATOR_IDLE' ? (
        <div class="space-y-4">
          {/* Airbnb Style Segmented Box for Datum/Tijdslot & Bezoekers (Photo 4) */}
          <div class="border border-border-strong rounded-xl overflow-hidden divide-y divide-border-hairline">
            <div class="p-3 hover:bg-surface-subtle transition-colors">
              <label
                htmlFor="widget-timeslot-select"
                class="block text-[10px] text-text-charcoal uppercase font-extrabold tracking-wider"
              >
                Datum &amp; Tijdslot
              </label>
              <select
                id="widget-timeslot-select"
                value={selectedTimeSlot}
                onChange={(e) => setSelectedTimeSlot((e.target as HTMLSelectElement).value)}
                class="w-full bg-transparent text-xs font-semibold text-text-charcoal mt-1 focus:outline-none cursor-pointer"
              >
                <option value="Vandaag, 14:00 - 16:30">Vandaag, 14:00 - 16:30</option>
                <option value="Vandaag, 19:00 - 21:30">Vandaag, 19:00 - 21:30 (Avondbanen)</option>
                <option value="Morgen, 07:00 - 09:30">Morgen, 07:00 - 09:30 (Vroege Vogel)</option>
                <option value="Weekend, 10:00 - 16:00">Weekend, 10:00 - 16:00 (Gezin &amp; Recreatie)</option>
              </select>
              <span class="block text-[11px] text-primary font-semibold mt-0.5">
                Recreatiebad &amp; Wedstrijdbanen
              </span>
            </div>

            <div class="p-3 bg-surface-pure">
              <button
                type="button"
                onClick={() => setVisitorPickerOpen((prev) => !prev)}
                class="w-full text-left flex items-center justify-between cursor-pointer"
              >
                <div>
                  <span class="block text-[10px] text-text-charcoal uppercase font-extrabold tracking-wider">
                    Bezoekers
                  </span>
                  <span class="block text-xs font-semibold text-text-charcoal mt-0.5">
                    {state.adultsCount} Volwassene{state.adultsCount !== 1 ? 'n' : ''}
                    {state.childrenCount > 0 ? `, ${state.childrenCount} Kind (t/m 12 jr)` : ''}
                  </span>
                </div>
                <span class="text-xs text-text-muted">{visitorPickerOpen ? '▴' : '▾'}</span>
              </button>

              {visitorPickerOpen && (
                <div class="mt-3 pt-3 border-t border-border-hairline space-y-2.5">
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-text-charcoal font-medium">
                      Volwassenen ({formatEuroCentsNl(props.adultPriceCents)})
                    </span>
                    <div class="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Minder volwassenen"
                        class="w-7 h-7 rounded-full border border-border-strong flex items-center justify-center font-bold hover:border-text-charcoal cursor-pointer"
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
                        aria-label="Meer volwassenen"
                        class="w-7 h-7 rounded-full border border-border-strong flex items-center justify-center font-bold hover:border-text-charcoal cursor-pointer"
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

                  <div class="flex items-center justify-between text-xs">
                    <span class="text-text-charcoal font-medium">
                      Kinderen t/m 12 jr ({formatEuroCentsNl(props.childPriceCents)})
                    </span>
                    <div class="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Minder kinderen"
                        class="w-7 h-7 rounded-full border border-border-strong flex items-center justify-center font-bold hover:border-text-charcoal cursor-pointer"
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
                        aria-label="Meer kinderen"
                        class="w-7 h-7 rounded-full border border-border-strong flex items-center justify-center font-bold hover:border-text-charcoal cursor-pointer"
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
                </div>
              )}
            </div>
          </div>

          {/* Itemized Price Breakdown (Photo 4) */}
          <div class="space-y-2 text-xs text-text-muted border-b border-border-hairline pb-3">
            {state.adultsCount > 0 && (
              <div class="flex justify-between">
                <span class="underline">{state.adultsCount}x Volwassene entree</span>
                <span class="text-text-charcoal font-semibold">
                  {formatEuroCentsNl(state.adultsCount * props.adultPriceCents)}
                </span>
              </div>
            )}
            {state.childrenCount > 0 && (
              <div class="flex justify-between">
                <span class="underline">{state.childrenCount}x Kind entree (t/m 12 jr)</span>
                <span class="text-text-charcoal font-semibold">
                  {formatEuroCentsNl(state.childrenCount * props.childPriceCents)}
                </span>
              </div>
            )}
            <div class="flex justify-between">
              <span>Reserveringskosten</span>
              <span class="text-emerald-700 font-semibold">€ 0,00 (Gratis)</span>
            </div>
          </div>

          <div class="flex justify-between items-baseline">
            <span class="font-bold text-text-charcoal">Totaalbedrag</span>
            <span class="text-xl font-extrabold text-text-charcoal">
              {formatEuroCentsNl(breakdown.totalCents)}
            </span>
          </div>

          {breakdown.tenPassPerVisitCents && (
            <p class="text-xs text-emerald-800 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200/70">
              Tip: Met een 10-badenkaart betaal je <strong>{formatEuroCentsNl(breakdown.tenPassPerVisitCents)}</strong> per bezoek ({breakdown.tenPassSavingsPercent}% besparing).
            </p>
          )}

          {outboundTicketUrl ? (
            <a
              href={outboundTicketUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleOfficialTicketClick}
              class="w-full h-12 rounded-full bg-primary hover:bg-primary-container text-on-primary text-xs md:text-sm font-bold flex items-center justify-center gap-2 shadow-md transition-all"
            >
              <span>Reserveer Tijdslot &amp; Koop Tickets</span>
              <span>↗</span>
            </a>
          ) : (
            <a
              href={props.googleMapsRouteUrl || '#locatie'}
              target={props.googleMapsRouteUrl ? '_blank' : undefined}
              rel={props.googleMapsRouteUrl ? 'noopener noreferrer' : undefined}
              class="w-full h-12 rounded-full bg-primary hover:bg-primary-container text-on-primary text-xs md:text-sm font-bold flex items-center justify-center gap-2 shadow-md transition-all"
            >
              <span>Bekijk locatie &amp; openingstijden</span>
              <span>↗</span>
            </a>
          )}

          {/* Trust Badges (Photo 4) */}
          <div class="pt-3 border-t border-border-hairline space-y-1.5 text-[11px] text-text-muted">
            <div class="flex items-center gap-2">
              <span class="text-primary font-bold">✓</span>
              <span>Officiële gemeentelijke &amp; zwembadtarieven zonder toeslag</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-primary font-bold">✓</span>
              <span>Directe doorgang naar de officiële website van dit zwembad</span>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleWaitlistSubmit} class="space-y-3 text-sm">
          <p class="text-xs text-text-muted">
            Ontvang direct de <strong>Top 3 zwemscholen met de kortste wachttijd</strong> rond jouw postcode (+ wachtlijst-alert).
          </p>
          <div>
            <label htmlFor="waitlist-pc4" class="block text-xs font-bold mb-1">
              4-Cijferige Postcode (PC4)
            </label>
            <input
              id="waitlist-pc4"
              type="text"
              maxLength={4}
              value={pc4}
              onInput={(e) => setPc4((e.target as HTMLInputElement).value)}
              class="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="waitlist-email" class="block text-xs font-bold mb-1">
              E-mailadres ouder
            </label>
            <input
              id="waitlist-email"
              type="email"
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              placeholder="ouder@voorbeeld.nl"
              class="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
            />
          </div>
          <label htmlFor="waitlist-prefers-salt" class="flex items-center gap-2 text-xs">
            <input
              id="waitlist-prefers-salt"
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
            <div class="space-y-3">
              <div class="p-3 rounded-xl bg-badge-teal-bg text-primary text-xs font-bold">
                ✓ Vergelijking gereed! Wachtlijst-alert geactiveerd voor postcode {pc4}.
              </div>
              {recommendations.length > 0 && (
                <div class="space-y-2 pt-2 border-t border-border-hairline">
                  <p class="text-xs font-bold text-text-charcoal">Snelste startplekken in jouw regio:</p>
                  {recommendations.map((rec) => (
                    <div class="p-2.5 rounded-lg bg-surface-subtle border border-border-hairline text-xs">
                      <div class="font-bold text-text-charcoal">{rec.venue_name}</div>
                      <div class="text-text-muted">{rec.provider_name}</div>
                      <div class="mt-1 flex justify-between items-center text-primary font-semibold">
                        <span>
                          Wachttijd: {rec.current_waitlist_weeks_min}–{rec.current_waitlist_weeks_max} wkn
                        </span>
                        <span>{formatEuroCentsNl(rec.monthly_price_cents)}/mnd</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting}
              class="w-full h-11 rounded-full bg-primary text-on-primary text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Bezig met zoeken...' : 'Vergelijk Kortste Wachttijden (Gratis)'}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
