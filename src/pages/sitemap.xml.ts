// src/pages/sitemap.xml.ts
import type { APIRoute } from 'astro';
import { getBuildDatabase } from '../db/runtime-db';
import { listAllVenues, listVenuesByCity } from '../db/queries';
import { shouldGenerateIndexableFacetPage } from '../domain/seo-aggregator';

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
  for (const city of cities) {
    const cityVenues = listVenuesByCity(db, city.slug);
    for (const intent of intents) {
      const matching =
        intent === 'buitenwater'
          ? cityVenues.filter(
              (v) => v.venue_type === 'OPEN_WATER_NATURAL' || v.venue_type === 'INDOOR_AND_OUTDOOR'
            )
          : cityVenues.filter((v) => v.venue_type !== 'OPEN_WATER_NATURAL');
      if (shouldGenerateIndexableFacetPage(matching.length)) {
        intentUrls.push(
          `<url><loc>https://zwemkaart.nl/steden/${city.slug}/${intent}</loc></url>`
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
    ...cities.map(
      (c) => `<url><loc>https://zwemkaart.nl/steden/${c.slug}</loc></url>`
    ),
    ...intentUrls,
    ...venues.map(
      (v) =>
        `<url><loc>https://zwemkaart.nl/zwembad/${v.municipality_slug}/${v.slug}</loc><lastmod>${v.lastmod_at}</lastmod></url>`
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
