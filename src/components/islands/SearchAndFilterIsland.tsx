import { useState } from 'preact/hooks';
import type { VenueRow } from '../../db/queries';
import { formatEuroCentsNl } from '../../domain/seo-aggregator';

export interface SearchAndFilterIslandProps {
  venues: VenueRow[];
}

export default function SearchAndFilterIsland({ venues }: SearchAndFilterIslandProps) {
  const [query, setQuery] = useState('');
  const [treatmentFilter, setTreatmentFilter] = useState<
    'ALL' | 'SALT_ELECTROLYSIS' | 'TRADITIONAL_CHLORINE' | 'NATURAL_UNTREATED'
  >('ALL');

  const filtered = venues.filter((v) => {
    const q = query.trim().toLowerCase();
    const matchesText =
      q === '' ||
      v.name.toLowerCase().includes(q) ||
      v.municipality_slug.toLowerCase().includes(q) ||
      (v.postcode_pc4 ?? '').includes(q);
    const matchesTreatment =
      treatmentFilter === 'ALL' || v.primary_water_treatment === treatmentFilter;
    return matchesText && matchesTreatment;
  });

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-border-hairline bg-surface-pure shadow-sm">
        <label htmlFor="venue-search-input" class="sr-only">
          Zoek op stad, zwembad of postcode
        </label>
        <input
          id="venue-search-input"
          type="search"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          placeholder="Zoek op stad, zwembad of 4-cijferige postcode (bijv. 1079)..."
          class="flex-1 min-w-[220px] px-3.5 py-2 rounded-xl border border-border-strong text-sm"
        />
        <div class="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTreatmentFilter('ALL')}
            class={`px-3 py-1.5 rounded-full border ${
              treatmentFilter === 'ALL'
                ? 'bg-text-charcoal text-surface-pure border-text-charcoal'
                : 'bg-surface-subtle text-text-charcoal border-border-hairline'
            }`}
          >
            Alle baden ({venues.length})
          </button>
          <button
            type="button"
            onClick={() => setTreatmentFilter('SALT_ELECTROLYSIS')}
            class={`px-3 py-1.5 rounded-full border ${
              treatmentFilter === 'SALT_ELECTROLYSIS'
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            Zoutelektrolyse (Zacht water)
          </button>
          <button
            type="button"
            onClick={() => setTreatmentFilter('TRADITIONAL_CHLORINE')}
            class={`px-3 py-1.5 rounded-full border ${
              treatmentFilter === 'TRADITIONAL_CHLORINE'
                ? 'bg-text-charcoal text-surface-pure border-text-charcoal'
                : 'bg-surface-subtle text-text-charcoal border-border-hairline'
            }`}
          >
            Klassiek Chloor
          </button>
          <button
            type="button"
            onClick={() => setTreatmentFilter('NATURAL_UNTREATED')}
            class={`px-3 py-1.5 rounded-full border ${
              treatmentFilter === 'NATURAL_UNTREATED'
                ? 'bg-cyan-800 text-white border-cyan-800'
                : 'bg-cyan-50 text-cyan-800 border-cyan-200'
            }`}
          >
            Natuurwater
          </button>
        </div>
      </div>

      <p class="text-xs text-text-muted">
        Toont <strong>{filtered.length}</strong> van {venues.length} gecontroleerde zwemlocaties
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {filtered.map((venue) => {
          const href = `/zwembad/${venue.municipality_slug}/${venue.slug}`;
          return (
            <article
              key={venue.id}
              class="group flex flex-col border border-border-hairline rounded-2xl p-4 bg-surface-pure hover:shadow-md transition-all"
            >
              <div class="flex items-start justify-between gap-2">
                <a
                  href={href}
                  class="text-base font-bold text-text-charcoal group-hover:text-primary transition-colors"
                >
                  {venue.name}
                </a>
                {venue.rating_score && (
                  <span class="text-xs font-bold text-text-charcoal shrink-0">
                    ★ {venue.rating_score.toFixed(2)} ({venue.rating_count})
                  </span>
                )}
              </div>
              <p class="text-xs text-text-muted mt-0.5">
                {venue.neighborhood_name ?? venue.municipality_slug}
              </p>
              <div class="mt-3 flex flex-wrap items-center gap-1.5">
                {venue.featured_badge_nl && (
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-badge-teal-bg text-primary">
                    {venue.featured_badge_nl}
                  </span>
                )}
                <span class="px-2.5 py-0.5 rounded-full text-xs font-medium border border-border-hairline bg-surface-subtle text-text-charcoal">
                  {venue.primary_water_treatment === 'SALT_ELECTROLYSIS'
                    ? 'Zoutelektrolyse (Zacht water)'
                    : venue.primary_water_treatment === 'NATURAL_UNTREATED'
                      ? 'Natuurwater'
                      : 'Klassiek Chloor'}
                </span>
              </div>
              <div class="mt-4 pt-3 border-t border-border-hairline flex items-baseline justify-between">
                <span class="text-sm font-bold text-text-charcoal">
                  {venue.min_single_price_cents === 0
                    ? 'Gratis toegang'
                    : venue.min_single_price_cents
                      ? `Vanaf ${formatEuroCentsNl(venue.min_single_price_cents)}`
                      : 'Prijs op aanvraag'}
                </span>
                <a href={href} class="text-xs font-semibold text-primary hover:underline">
                  Bekijk rooster & zwemles →
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
