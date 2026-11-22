import type { APIRoute } from 'astro';
import { getBuildDatabase } from '../../db/runtime-db';
import { listAllVenues, listIndexableWoonplaatsen } from '../../db/queries';
import type { CompactSearchTuple } from '../../domain/search-suggestions';

function formatCountNl(count: number): string {
  return count === 1 ? '1 locatie' : `${count} locaties`;
}

function extractCompactHost(rawUrl: string | null): string {
  if (!rawUrl) return '';
  try {
    return new URL(rawUrl).hostname.replace(/^www\./i, '');
  } catch {
    return rawUrl.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0] ?? '';
  }
}

export const GET: APIRoute = () => {
  const db = getBuildDatabase();

  const municipalities = db
    .prepare(
      `SELECT m.slug, m.name, m.province_name, COUNT(v.id) AS venue_count
       FROM municipalities m
       JOIN venues v ON v.municipality_slug = m.slug
       GROUP BY m.slug
       ORDER BY m.name ASC`
    )
    .all() as Array<{
    slug: string;
    name: string;
    province_name: string;
    venue_count: number;
  }>;

  const tuples: CompactSearchTuple[] = [];
  const seenStadSlugs = new Set<string>();
  const municipalityNameBySlug = new Map<string, string>();

  for (const m of municipalities) {
    seenStadSlugs.add(m.slug);
    municipalityNameBySlug.set(m.slug, m.name);
    const slugSpaced = m.slug.replace(/-/g, ' ');
    const meta = slugSpaced !== m.name.toLowerCase() ? slugSpaced : undefined;
    tuples.push(
      meta
        ? ['m', m.name, `${m.province_name} · ${formatCountNl(m.venue_count)}`, `/steden/${m.slug}`, meta]
        : ['m', m.name, `${m.province_name} · ${formatCountNl(m.venue_count)}`, `/steden/${m.slug}`]
    );
  }

  const woonplaatsen = listIndexableWoonplaatsen(db);
  for (const wp of woonplaatsen) {
    if (seenStadSlugs.has(wp.slug)) continue;
    seenStadSlugs.add(wp.slug);
    const munName = municipalityNameBySlug.get(wp.municipality_slug) ?? wp.municipality_name;
    tuples.push([
      'w',
      wp.name,
      `${munName} · ${formatCountNl(wp.venue_count)}`,
      `/steden/${wp.slug}`,
    ]);
  }

  const venues = listAllVenues(db);
  for (const v of venues) {
    const munName = municipalityNameBySlug.get(v.municipality_slug) ?? v.municipality_slug;
    const placeLabel = v.woonplaats_name ?? munName;
    const detailLabel =
      v.street_address?.trim() ||
      (v.venue_type === 'OPEN_WATER_NATURAL' ? 'Natuurwater' : 'Zwembad');
    const sublabel = `${placeLabel} • ${detailLabel}`;
    const host = extractCompactHost(v.official_website_url);
    const pc6Compact = v.postcode_pc6 ? v.postcode_pc6.replace(/\s+/g, '') : '';

    const metaTokens: string[] = [];
    if (placeLabel.toLowerCase() !== munName.toLowerCase()) {
      metaTokens.push(munName);
    }
    if (v.neighborhood_name && v.neighborhood_name.toLowerCase() !== placeLabel.toLowerCase()) {
      metaTokens.push(v.neighborhood_name);
    }
    if (v.postcode_pc6) metaTokens.push(v.postcode_pc6);
    if (pc6Compact && pc6Compact !== v.postcode_pc4) metaTokens.push(pc6Compact);
    else if (v.postcode_pc4) metaTokens.push(v.postcode_pc4);
    if (v.operator_name) metaTokens.push(v.operator_name);
    if (host) metaTokens.push(host);

    const meta = metaTokens.join(' ');
    tuples.push(
      meta
        ? ['v', v.name, sublabel, `/zwembad/${v.municipality_slug}/${v.slug}`, meta]
        : ['v', v.name, sublabel, `/zwembad/${v.municipality_slug}/${v.slug}`]
    );
  }

  db.close();

  return new Response(JSON.stringify(tuples), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
};
