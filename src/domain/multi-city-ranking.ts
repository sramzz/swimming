import type { VenueRow } from '../db/queries';
import { haversineDistanceKm } from '../db/geo';

export interface FeaturedDutchCity {
  slug: string;
  labelNl: string;
  lat: number;
  lng: number;
}

export const FEATURED_DUTCH_CITIES: FeaturedDutchCity[] = [
  { slug: 'amsterdam', labelNl: 'Amsterdam', lat: 52.3676, lng: 4.9041 },
  { slug: 'rotterdam', labelNl: 'Rotterdam', lat: 51.9244, lng: 4.4777 },
  { slug: 'den-haag', labelNl: 'Den Haag', lat: 52.0705, lng: 4.3007 },
  { slug: 'utrecht', labelNl: 'Utrecht', lat: 52.0907, lng: 5.1214 },
  { slug: 'eindhoven', labelNl: 'Eindhoven', lat: 51.4416, lng: 5.4697 },
  { slug: 'groningen', labelNl: 'Groningen', lat: 53.2194, lng: 6.5665 },
  { slug: 'maastricht', labelNl: 'Maastricht', lat: 50.8514, lng: 5.691 },
  { slug: 'tilburg', labelNl: 'Tilburg', lat: 51.5555, lng: 5.0913 },
  { slug: 'almere', labelNl: 'Almere', lat: 52.3508, lng: 5.2647 },
  { slug: 'breda', labelNl: 'Breda', lat: 51.5719, lng: 4.7683 },
  { slug: 'nijmegen', labelNl: 'Nijmegen', lat: 51.8126, lng: 5.8372 },
  { slug: 'apeldoorn', labelNl: 'Apeldoorn', lat: 52.2112, lng: 5.9699 },
];

/**
 * Round-robin interleaving across Dutch municipalities so the default homepage
 * showcases a diverse national mix of top-rated pools across the Netherlands
 * rather than clustering 4 Amsterdam pools at the top.
 */
export function rankVenuesMultiCityRecommended(venues: VenueRow[]): VenueRow[] {
  const baseSorted = [...venues].sort((a, b) => {
    const aRated = a.rating_score !== null ? 1 : 0;
    const bRated = b.rating_score !== null ? 1 : 0;
    if (aRated !== bRated) return bRated - aRated;
    const scoreDiff = (b.rating_score ?? 0) - (a.rating_score ?? 0);
    if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
    return a.name.localeCompare(b.name, 'nl');
  });

  // Group by municipality_slug preserving internal rating order
  const buckets = new Map<string, VenueRow[]>();
  for (const v of baseSorted) {
    const list = buckets.get(v.municipality_slug) ?? [];
    list.push(v);
    buckets.set(v.municipality_slug, list);
  }

  // Order municipality buckets by their best venue's rating (with featured major cities prioritized when tied)
  const featuredOrder = new Map(FEATURED_DUTCH_CITIES.map((c, idx) => [c.slug, idx]));
  const orderedCityKeys = [...buckets.keys()].sort((munA, munB) => {
    const topA = buckets.get(munA)![0];
    const topB = buckets.get(munB)![0];
    const aHasRating = topA.rating_score !== null ? 1 : 0;
    const bHasRating = topB.rating_score !== null ? 1 : 0;
    if (aHasRating !== bHasRating) return bHasRating - aHasRating;

    const featA = featuredOrder.get(munA);
    const featB = featuredOrder.get(munB);
    if (featA !== undefined && featB !== undefined) return featA - featB;
    if (featA !== undefined) return -1;
    if (featB !== undefined) return 1;

    return (topB.rating_score ?? 0) - (topA.rating_score ?? 0);
  });

  // Round-robin pass across municipalities
  const interleaved: VenueRow[] = [];
  let addedInPass = true;
  let round = 0;
  while (addedInPass) {
    addedInPass = false;
    for (const munKey of orderedCityKeys) {
      const bucket = buckets.get(munKey)!;
      if (round < bucket.length) {
        interleaved.push(bucket[round]);
        addedInPass = true;
      }
    }
    round++;
  }

  return interleaved;
}

export function rankVenuesByUserLocation(
  venues: VenueRow[],
  userLat: number,
  userLng: number
): VenueRow[] {
  return [...venues].sort((a, b) => {
    const distA = haversineDistanceKm(userLat, userLng, a.lat, a.lng);
    const distB = haversineDistanceKm(userLat, userLng, b.lat, b.lng);
    return distA - distB;
  });
}
