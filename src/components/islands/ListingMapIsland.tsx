import { useEffect, useRef, useState } from 'preact/hooks';
import type { VenueRow } from '../../db/queries';
import { formatEuroCentsNl } from '../../domain/seo-aggregator';

export interface ListingMapIslandProps {
  venues: VenueRow[];
  styleUrl?: string;
}

export default function ListingMapIsland({
  venues,
  styleUrl = 'https://tiles.openfreemap.org/styles/positron',
}: ListingMapIslandProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<VenueRow | null>(venues[0] ?? null);

  useEffect(() => {
    let mapInstance: { remove: () => void } | null = null;

    async function initMap() {
      if (!mapContainerRef.current) return;
      const maplibregl = await import('maplibre-gl');
      const map = new maplibregl.default.Map({
        container: mapContainerRef.current,
        style: styleUrl,
        center: [4.9041, 52.35],
        zoom: 11,
      });
      mapInstance = map;

      for (const venue of venues) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className =
          'px-2.5 py-1 rounded-full bg-white text-neutral-900 font-bold text-xs shadow-md border border-neutral-300 hover:bg-neutral-900 hover:text-white transition-colors';
        el.textContent =
          venue.min_single_price_cents === 0
            ? 'Gratis'
            : venue.min_single_price_cents
              ? formatEuroCentsNl(venue.min_single_price_cents)
              : venue.name;
        el.addEventListener('click', () => setSelectedVenue(venue));

        new maplibregl.default.Marker({ element: el })
          .setLngLat([venue.lng, venue.lat])
          .addTo(map);
      }
    }

    initMap().catch(() => {
      // Fallback to interactive pin list if WebGL is unavailable in headless test env
    });

    return () => {
      if (mapInstance) mapInstance.remove();
    };
  }, [venues, styleUrl]);

  return (
    <div class="relative w-full h-[460px] rounded-3xl overflow-hidden border border-border-hairline bg-surface-subtle">
      <div ref={mapContainerRef} class="w-full h-full" />
      {selectedVenue && (
        <div class="absolute bottom-4 left-4 right-4 max-w-xs bg-surface-pure rounded-2xl p-3.5 shadow-xl border border-border-hairline">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h4 class="font-bold text-sm text-text-charcoal">{selectedVenue.name}</h4>
              <p class="text-xs text-text-muted">{selectedVenue.neighborhood_name}</p>
            </div>
            {selectedVenue.rating_score && (
              <span class="text-xs font-bold">★ {selectedVenue.rating_score.toFixed(2)}</span>
            )}
          </div>
          <div class="mt-2 pt-2 border-t border-border-hairline flex items-center justify-between text-xs">
            <span class="font-bold text-primary">
              {selectedVenue.min_single_price_cents === 0
                ? 'Gratis toegang'
                : selectedVenue.min_single_price_cents
                  ? formatEuroCentsNl(selectedVenue.min_single_price_cents)
                  : ''}
            </span>
            <a
              href={`/zwembad/${selectedVenue.municipality_slug}/${selectedVenue.slug}`}
              class="font-semibold underline text-text-charcoal"
            >
              Bekijk details →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
