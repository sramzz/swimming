// src/pages/sitemap.xml.ts
import type { APIRoute } from 'astro';
import { getBuildDatabase } from '../db/runtime-db';
import { listAllVenues } from '../db/queries';

export const GET: APIRoute = () => {
  const db = getBuildDatabase();
  const venues = listAllVenues(db);
  db.close();

  const urls = [
    `<url><loc>https://allezwembaden.nl/</loc></url>`,
    ...venues.map(
      (v) =>
        `<url><loc>https://allezwembaden.nl/zwembad/${v.municipality_slug}/${v.slug}</loc><lastmod>${v.lastmod_at}</lastmod></url>`
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
