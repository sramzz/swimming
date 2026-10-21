import { useState } from 'preact/hooks';
import type { VenueRow } from '../../db/queries';

export interface SearchAndFilterIslandProps {
  venues: VenueRow[];
}

export default function SearchAndFilterIsland({ venues }: SearchAndFilterIslandProps) {
  const [query, setQuery] = useState('');
  const [treatmentFilter, setTreatmentFilter] = useState<'ALL' | 'SALT_ELECTROLYSIS' | 'TRADITIONAL_CHLORINE'>('ALL');

  const filtered = venues.filter((v) => {
    const matchesText =
      query.trim() === '' ||
      v.name.toLowerCase().includes(query.toLowerCase()) ||
      (v.postcode_pc4 ?? '').includes(query.trim());
    const matchesTreatment =
      treatmentFilter === 'ALL' || v.primary_water_treatment === treatmentFilter;
    return matchesText && matchesTreatment;
  });

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-border-hairline bg-surface-pure shadow-sm">
        <input
          type="search"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          placeholder="Zoek op zwembad of 4-cijferige postcode (bijv. 1079)..."
          class="flex-1 min-w-[220px] px-3 py-2 rounded-xl border border-border-strong text-sm"
        />
        <div class="flex items-center gap-2 text-xs font-semibold">
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
        </div>
      </div>
      <p class="text-xs text-text-muted">
        Toont <strong>{filtered.length}</strong> van {venues.length} zwemlocaties
      </p>
    </div>
  );
}
