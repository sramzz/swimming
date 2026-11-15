import defaultWoonplaatsenRaw from '../data/dutch-woonplaatsen.json';
import { haversineDistanceKm } from '../db/geo';

export interface BagWoonplaatsRecord {
  id: string;               // 'wpl-' + bag_id, e.g. 'wpl-1244'
  bag_id: string;           // 4-digit BAG woonplaatscode, e.g. '1244'
  slug: string;             // SEO slug, unique across all records, e.g. 'abcoude', 'valkenburg-lb'
  name: string;             // Official BAG name, e.g. 'Abcoude'
  municipality_slug: string;// FK slug in src/data/dutch-municipalities.json, e.g. 'de-ronde-venen'
  municipality_name: string;// e.g. 'De Ronde Venen'
  cbs_code: string;         // e.g. 'GM0736'
  province_slug: string;    // e.g. 'utrecht'
  center_lat: number;
  center_lng: number;
  primary_pc4?: string;     // Optional 4-digit postcode centroid from BAG
}

export interface ResolveLocationInput {
  placeName?: string | null;
  streetAddress?: string | null;
  postcodePc6?: string | null;
  lat: number;
  lng: number;
  bagWoonplaatsCode?: string | null;
}

export interface ResolvedDutchLocation {
  woonplaatsId: string;
  woonplaatsBagId: string;
  woonplaatsSlug: string;
  woonplaatsName: string;
  municipalitySlug: string;
  municipalityName: string;
  provinceSlug: string;
  postcodePc4: string | null;
  postcodePc6: string | null;
}

const defaultWoonplaatsen: BagWoonplaatsRecord[] =
  defaultWoonplaatsenRaw as BagWoonplaatsRecord[];

export function slugifyNl(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function resolveDutchLocation(
  input: ResolveLocationInput,
  woonplaatsen: BagWoonplaatsRecord[] = defaultWoonplaatsen
): ResolvedDutchLocation {
  if (!woonplaatsen || woonplaatsen.length === 0) {
    throw new Error('No woonplaatsen dataset available to resolve location');
  }

  // 1. Postcode normalization
  let normalizedPc4: string | null = null;
  let normalizedPc6: string | null = null;
  if (input.postcodePc6) {
    const trimmed = input.postcodePc6.trim();
    const pc6Match = trimmed.match(/^([1-9]\d{3})\s*([A-Za-z]{2})$/);
    if (pc6Match) {
      normalizedPc4 = pc6Match[1];
      normalizedPc6 = `${pc6Match[1]} ${pc6Match[2].toUpperCase()}`;
    } else {
      const pc4Match = trimmed.match(/^([1-9]\d{3})$/);
      if (pc4Match) {
        normalizedPc4 = pc4Match[1];
      }
    }
  }

  // 2. Precedence: bagWoonplaatsCode lookup
  let chosenRecord: BagWoonplaatsRecord | null = null;
  if (input.bagWoonplaatsCode) {
    const cleanCode = input.bagWoonplaatsCode.trim().toLowerCase();
    const match = woonplaatsen.find(
      (r) =>
        r.bag_id.toLowerCase() === cleanCode ||
        r.id.toLowerCase() === cleanCode ||
        r.id.toLowerCase() === `wpl-${cleanCode}`
    );
    if (match) {
      chosenRecord = match;
    }
  }

  // 3. Name-based candidates extraction
  if (!chosenRecord) {
    let candidateName: string | null = null;
    if (input.placeName && input.placeName.trim().length > 0) {
      candidateName = input.placeName.trim();
    } else if (input.streetAddress && input.streetAddress.trim().length > 0) {
      const segments = input.streetAddress
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (segments.length > 1) {
        const lastSegment = segments[segments.length - 1];
        const stripped = lastSegment
          .replace(/^[1-9]\d{3}\s*([A-Za-z]{2})?\s+/, '')
          .trim();
        if (stripped.length > 0) {
          candidateName = stripped;
        }
      }
    }

    if (candidateName) {
      const targetSlug = slugifyNl(candidateName);
      let candidates = woonplaatsen.filter((r) => {
        const rNameSlug = slugifyNl(r.name);
        return rNameSlug === targetSlug || r.slug === targetSlug;
      });
      if (candidates.length === 0) {
        candidates = woonplaatsen.filter((r) => r.slug.startsWith(`${targetSlug}-`));
      }
      if (candidates.length === 0) {
        candidates = woonplaatsen.filter((r) => r.municipality_slug === targetSlug);
      }

      if (candidates.length === 1) {
        chosenRecord = candidates[0];
      } else if (candidates.length > 1) {
        let bestDist = Infinity;
        let bestCandidate = candidates[0];
        for (const c of candidates) {
          const dist = haversineDistanceKm(
            input.lat,
            input.lng,
            c.center_lat,
            c.center_lng
          );
          if (dist < bestDist) {
            bestDist = dist;
            bestCandidate = c;
          }
        }
        chosenRecord = bestCandidate;
      }
    }
  }

  // 4. Fallback: Nearest haversine neighbor
  if (!chosenRecord) {
    let bestDist = Infinity;
    let bestRecord = woonplaatsen[0];
    for (const r of woonplaatsen) {
      const dist = haversineDistanceKm(
        input.lat,
        input.lng,
        r.center_lat,
        r.center_lng
      );
      if (dist < bestDist) {
        bestDist = dist;
        bestRecord = r;
      }
    }
    chosenRecord = bestRecord;
  }

  return {
    woonplaatsId: chosenRecord.id,
    woonplaatsBagId: chosenRecord.bag_id,
    woonplaatsSlug: chosenRecord.slug,
    woonplaatsName: chosenRecord.name,
    municipalitySlug: chosenRecord.municipality_slug,
    municipalityName: chosenRecord.municipality_name,
    provinceSlug: chosenRecord.province_slug,
    postcodePc4: normalizedPc4 ?? chosenRecord.primary_pc4 ?? null,
    postcodePc6: normalizedPc6,
  };
}
