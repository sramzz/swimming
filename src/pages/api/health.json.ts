import type { APIRoute } from 'astro';
import { getBuildDatabase } from '../../db/runtime-db';
import { handleHealthCheckQuery } from '../../api/handlers';

export const GET: APIRoute = () => {
  const db = getBuildDatabase();
  const status = handleHealthCheckQuery(db);
  db.close();

  return new Response(JSON.stringify(status, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
