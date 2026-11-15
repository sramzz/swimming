import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

interface MunicipalityRecord {
  slug: string;
  cbs_code: string;
  name: string;
  province_slug: string;
  province_name: string;
  school_vacation_region: 'noord' | 'midden' | 'zuid';
  center_lat: number;
  center_lng: number;
}

interface PdokWoonplaatsDoc {
  bron: string;
  identificatie: string;
  woonplaatscode: string;
  type: string;
  woonplaatsnaam: string;
  provincienaam: string;
  provincieafkorting: string;
  centroide_ll: string;
  gemeentecode: string;
  gemeentenaam: string;
}

interface PdokSearchResponse {
  response: {
    numFound: number;
    start: number;
    docs: PdokWoonplaatsDoc[];
  };
}

interface PdokPostcodeDoc {
  postcode?: string;
}

interface PdokPostcodeResponse {
  response: {
    numFound: number;
    docs: PdokPostcodeDoc[];
  };
}

export function slugifyNl(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if (attempt === retries) {
        throw new Error(`HTTP ${res.status} (${res.statusText}) for ${url}`);
      }
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw new Error(`Failed to fetch ${url}`);
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

export async function harvestBagWoonplaatsen(): Promise<BagWoonplaatsRecord[]> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const municipalitiesPath = path.resolve(__dirname, '../data/dutch-municipalities.json');
  const municipalitiesRaw = await fs.readFile(municipalitiesPath, 'utf8');
  const municipalities: MunicipalityRecord[] = JSON.parse(municipalitiesRaw);

  const munByCbs = new Map<string, MunicipalityRecord>();
  const munBySlug = new Map<string, MunicipalityRecord>();
  for (const m of municipalities) {
    munByCbs.set(m.cbs_code, m);
    munBySlug.set(m.slug, m);
  }

  console.log('Fetching BAG woonplaatsen from PDOK Locatieserver...');
  const allDocs: PdokWoonplaatsDoc[] = [];
  let start = 0;
  let totalFound = 0;

  while (true) {
    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=type:woonplaats&rows=100&start=${start}`;
    const res = await fetchWithRetry(url);
    const data = (await res.json()) as PdokSearchResponse;
    totalFound = data.response.numFound;
    const docs = data.response.docs || [];
    allDocs.push(...docs);
    start += docs.length;
    if (start >= totalFound || docs.length === 0) {
      break;
    }
  }

  console.log(`Fetched ${allDocs.length} raw woonplaats docs (PDOK numFound=${totalFound}).`);

  // Concurrently resolve primary_pc4 for each town
  console.log('Resolving primary_pc4 for all towns with concurrency 20...');
  const pc4List = await mapConcurrent(allDocs, 20, async (doc) => {
    const code = doc.identificatie || doc.woonplaatscode;
    try {
      const pcUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=type:postcode%20AND%20woonplaatscode:${encodeURIComponent(code)}&rows=1&fl=postcode`;
      const pcRes = await fetchWithRetry(pcUrl, 2);
      const pcData = (await pcRes.json()) as PdokPostcodeResponse;
      const pc = pcData.response?.docs?.[0]?.postcode;
      if (pc && /^[1-9]\d{3}/.test(pc)) {
        return pc.slice(0, 4);
      }
    } catch {
      // Non-fatal if a town has no registered postcode centroid
    }
    return undefined;
  });

  const enrichedCount = pc4List.filter(Boolean).length;
  console.log(`Enriched primary_pc4 for ${enrichedCount}/${allDocs.length} woonplaatsen.`);

  // Intermediate doc representations with matched municipality
  interface DocWithMunicipality {
    doc: PdokWoonplaatsDoc;
    bag_id: string;
    lat: number;
    lng: number;
    primary_pc4?: string;
    mun: MunicipalityRecord;
    baseSlug: string;
  }

  const intermediate: DocWithMunicipality[] = [];

  for (let i = 0; i < allDocs.length; i++) {
    const doc = allDocs[i];
    const bag_id = doc.identificatie || doc.woonplaatscode;

    // Parse POINT(lng lat)
    const match = doc.centroide_ll.match(/POINT\(([\d.-]+)\s+([\d.-]+)\)/);
    if (!match) {
      throw new Error(`Invalid centroide_ll for woonplaats ${bag_id}: ${doc.centroide_ll}`);
    }
    const lng = parseFloat(match[1]);
    const lat = parseFloat(match[2]);

    const cbsCode = 'GM' + doc.gemeentecode.padStart(4, '0');
    let mun = munByCbs.get(cbsCode);

    if (!mun) {
      // Fallback 1: match by normalized gemeentenaam
      const munSlug = slugifyNl(doc.gemeentenaam);
      mun = munBySlug.get(munSlug);
    }

    if (!mun) {
      // Fallback 2: nearest haversine distance
      let nearestDist = Infinity;
      let nearestMun = municipalities[0];
      for (const m of municipalities) {
        const dist = haversineDistanceKm(lat, lng, m.center_lat, m.center_lng);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestMun = m;
        }
      }
      mun = nearestMun;
    }

    const baseSlug = slugifyNl(doc.woonplaatsnaam);
    intermediate.push({
      doc,
      bag_id,
      lat,
      lng,
      primary_pc4: pc4List[i],
      mun,
      baseSlug,
    });
  }

  // Deterministic slug disambiguation
  const byBase = new Map<string, DocWithMunicipality[]>();
  for (const item of intermediate) {
    if (!byBase.has(item.baseSlug)) {
      byBase.set(item.baseSlug, []);
    }
    byBase.get(item.baseSlug)!.push(item);
  }

  const finalRecords: BagWoonplaatsRecord[] = [];
  const assignedSlugs = new Set<string>();

  for (const [baseSlug, items] of byBase.entries()) {
    if (items.length === 1) {
      const it = items[0];
      assignedSlugs.add(baseSlug);
      finalRecords.push({
        id: `wpl-${it.bag_id}`,
        bag_id: it.bag_id,
        slug: baseSlug,
        name: it.doc.woonplaatsnaam,
        municipality_slug: it.mun.slug,
        municipality_name: it.mun.name,
        cbs_code: it.mun.cbs_code,
        province_slug: it.mun.province_slug,
        center_lat: it.lat,
        center_lng: it.lng,
        ...(it.primary_pc4 ? { primary_pc4: it.primary_pc4 } : {}),
      });
    } else {
      // Multiple items share the base slug across the Netherlands
      // Group by province abbreviation
      const byProv = new Map<string, DocWithMunicipality[]>();
      for (const it of items) {
        const prov = (it.doc.provincieafkorting || 'nl').toLowerCase();
        if (!byProv.has(prov)) {
          byProv.set(prov, []);
        }
        byProv.get(prov)!.push(it);
      }

      for (const [prov, provItems] of byProv.entries()) {
        if (provItems.length === 1) {
          const it = provItems[0];
          const slug = `${baseSlug}-${prov}`;
          assignedSlugs.add(slug);
          finalRecords.push({
            id: `wpl-${it.bag_id}`,
            bag_id: it.bag_id,
            slug,
            name: it.doc.woonplaatsnaam,
            municipality_slug: it.mun.slug,
            municipality_name: it.mun.name,
            cbs_code: it.mun.cbs_code,
            province_slug: it.mun.province_slug,
            center_lat: it.lat,
            center_lng: it.lng,
            ...(it.primary_pc4 ? { primary_pc4: it.primary_pc4 } : {}),
          });
        } else {
          // Multiple items in the same province share this base name
          for (const it of provItems) {
            let slug = `${baseSlug}-${prov}-${it.mun.slug}`;
            if (assignedSlugs.has(slug)) {
              slug = `${baseSlug}-${prov}-${it.bag_id}`;
            }
            assignedSlugs.add(slug);
            finalRecords.push({
              id: `wpl-${it.bag_id}`,
              bag_id: it.bag_id,
              slug,
              name: it.doc.woonplaatsnaam,
              municipality_slug: it.mun.slug,
              municipality_name: it.mun.name,
              cbs_code: it.mun.cbs_code,
              province_slug: it.mun.province_slug,
              center_lat: it.lat,
              center_lng: it.lng,
              ...(it.primary_pc4 ? { primary_pc4: it.primary_pc4 } : {}),
            });
          }
        }
      }
    }
  }

  // Sort deterministically by slug ascending
  finalRecords.sort((a, b) => a.slug.localeCompare(b.slug));

  // Sanity assertions
  const idSet = new Set<string>();
  const bagIdSet = new Set<string>();
  const slugSet = new Set<string>();

  for (const r of finalRecords) {
    if (idSet.has(r.id)) {
      throw new Error(`Duplicate id detected: ${r.id}`);
    }
    idSet.add(r.id);

    if (bagIdSet.has(r.bag_id)) {
      throw new Error(`Duplicate bag_id detected: ${r.bag_id}`);
    }
    bagIdSet.add(r.bag_id);

    if (slugSet.has(r.slug)) {
      throw new Error(`Duplicate slug detected: ${r.slug}`);
    }
    slugSet.add(r.slug);

    if (!munBySlug.has(r.municipality_slug)) {
      throw new Error(
        `Unknown municipality_slug ${r.municipality_slug} on woonplaats ${r.slug}`
      );
    }
  }

  return finalRecords;
}

async function main() {
  const records = await harvestBagWoonplaatsen();
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outputPath = path.resolve(__dirname, '../data/dutch-woonplaatsen.json');
  await fs.writeFile(outputPath, JSON.stringify(records, null, 2) + '\n', 'utf8');
  console.log(`Successfully harvested ${records.length} BAG woonplaatsen to ${outputPath}`);
}

// Run CLI when invoked directly
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error('Fatal error during BAG harvest:', err);
    process.exit(1);
  });
}
