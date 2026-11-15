// src/pages/sitemap.xml.ts
import type { APIRoute } from 'astro';
import { getBuildDatabase } from '../db/runtime-db';
import {
  listAllVenues,
  listVenuesByCity,
  listIndexableWoonplaatsen,
  listVenuesByWoonplaats,
} from '../db/queries';
import { matchesIntent, shouldGenerateIndexableFacetPage } from '../domain/seo-aggregator';

export const GET: APIRoute = () => {
  const db = getBuildDatabase();
  const venues = listAllVenues(db);
  const provinces = db
    .prepare('SELECT DISTINCT province_slug FROM municipalities ORDER BY province_slug')
    .all() as Array<{ province_slug: string }>;
  const cities = db
    .prepare(
      `SELECT DISTINCT slug FROM municipalities
       WHERE slug IN (SELECT DISTINCT municipality_slug FROM venues)
       ORDER BY slug`
    )
    .all() as Array<{ slug: string }>;

  const intents = ['banenzwemmen', 'zwemles', 'buitenwater'] as const;
  const intentUrls: string[] = [];
  const cityUrls: string[] = [];
  const seenStadSlugs = new Set<string>();

  for (const city of cities) {
    seenStadSlugs.add(city.slug);
    cityUrls.push(`<url><loc>https://zwemkaart.nl/steden/${city.slug}</loc></url>`);

    const cityVenues = listVenuesByCity(db, city.slug);
    for (const intent of intents) {
      const matching = cityVenues.filter((v) => matchesIntent(v, intent));
      if (shouldGenerateIndexableFacetPage(matching.length)) {
        intentUrls.push(
          `<url><loc>https://zwemkaart.nl/steden/${city.slug}/${intent}</loc></url>`
        );
      }
    }
  }

  const indexableWoonplaatsen = listIndexableWoonplaatsen(db);
  const woonplaatsUrls: string[] = [];

  for (const wp of indexableWoonplaatsen) {
    if (seenStadSlugs.has(wp.slug)) continue;
    seenStadSlugs.add(wp.slug);

    woonplaatsUrls.push(`<url><loc>https://zwemkaart.nl/steden/${wp.slug}</loc></url>`);

    const wpVenues = listVenuesByWoonplaats(db, wp.slug);
    for (const intent of intents) {
      const matching = wpVenues.filter((v) => matchesIntent(v, intent));
      if (shouldGenerateIndexableFacetPage(matching.length)) {
        intentUrls.push(
          `<url><loc>https://zwemkaart.nl/steden/${wp.slug}/${intent}</loc></url>`
        );
      }
    }
  }

  db.close();

  const urls = [
    `<url><loc>https://zwemkaart.nl/</loc></url>`,
    `<url><loc>https://zwemkaart.nl/steden</loc></url>`,
    `<url><loc>https://zwemkaart.nl/aanbieder</loc></url>`,
    ...provinces.map(
      (p) => `<url><loc>https://zwemkaart.nl/provincies/${p.province_slug}</loc></url>`
    ),
    ...cityUrls,
    ...woonplaatsUrls,
    ...intentUrls,
    ...venues.map((v) => {
      const trimmedLastmod = v.lastmod_at.trim();
      const lastmodIso = trimmedLastmod.includes('T')
        ? trimmedLastmod
        : `${trimmedLastmod.replace(' ', 'T')}Z`;
      return `<url><loc>https://zwemkaart.nl/zwembad/${v.municipality_slug}/${v.slug}</loc><lastmod>${lastmodIso}</lastmod></url>`;
    }),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
