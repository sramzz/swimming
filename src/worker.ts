export interface Env {
  DB: {
    prepare: (query: string) => {
      bind: (...args: unknown[]) => {
        first: <T = unknown>() => Promise<T | null>;
        all: <T = unknown>() => Promise<{ results: T[] }>;
        run: () => Promise<{ success: boolean; meta?: unknown }>;
      };
      first: <T = unknown>() => Promise<T | null>;
      all: <T = unknown>() => Promise<{ results: T[] }>;
      run: () => Promise<{ success: boolean; meta?: unknown }>;
    };
  };
  ASSETS?: {
    fetch: (request: Request | string) => Promise<Response>;
  };
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  // GET /api/health or /api/health.json
  if (request.method === 'GET' && (path === '/api/health' || path === '/api/health.json')) {
    try {
      const row = await env.DB.prepare('SELECT COUNT(*) as c FROM venues').first<{ c: number }>();
      return new Response(
        JSON.stringify({
          ok: true,
          dbConnected: true,
          venuesCount: row?.c ?? 0,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({
          ok: false,
          dbConnected: false,
          error: err instanceof Error ? err.message : String(err),
        }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }
  }

  // POST /api/leads
  if (request.method === 'POST' && path === '/api/leads') {
    try {
      const body = await request.json() as {
        parentEmail?: string;
        postcodePc4?: string;
        childAgeYears?: number;
        diplomaTrack?: string;
        prefersSaltWater?: boolean;
      };

      const email = body.parentEmail?.trim().toLowerCase();
      const pc4 = body.postcodePc4?.trim();

      if (!email || !pc4 || !/^[1-9][0-9]{3}$/.test(pc4)) {
        return new Response(
          JSON.stringify({
            ok: false,
            errorMessageNl: 'Vul een geldig e-mailadres en een 4-cijferige postcode in (bijv. 1079).',
          }),
          {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          }
        );
      }

      const diplomaTrack = body.diplomaTrack || 'DIPLOMA_A';
      const dateBucket = new Date().toISOString().slice(0, 10);
      const idempotencyKey = `${email}:${pc4}:${diplomaTrack}:${dateBucket}`;
      const leadId = `lead-${crypto.randomUUID()}`;

      await env.DB.prepare(
        `INSERT INTO lead_requests (
          id, idempotency_key, parent_email, postcode_pc4,
          child_age_years, diploma_track, prefers_salt_water, lead_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPARISON_SENT')
        ON CONFLICT(idempotency_key) DO NOTHING`
      )
        .bind(
          leadId,
          idempotencyKey,
          email,
          pc4,
          body.childAgeYears ?? 4.5,
          diplomaTrack,
          body.prefersSaltWater ? 1 : 0
        )
        .run();

      // Top 3 waitlist query near PC4
      let topOfferings: unknown[] = [];
      try {
        const pc4Row = await env.DB.prepare('SELECT lat, lng FROM postcode_pc4 WHERE pc4 = ?')
          .bind(pc4)
          .first<{ lat: number; lng: number }>();

        if (pc4Row?.lat && pc4Row?.lng) {
          const minLat = pc4Row.lat - 0.25;
          const maxLat = pc4Row.lat + 0.25;
          const minLng = pc4Row.lng - 0.35;
          const maxLng = pc4Row.lng + 0.35;

          const results = await env.DB.prepare(
            `SELECT o.*, v.name AS venue_name, v.slug AS venue_slug, v.municipality_slug,
                    v.primary_water_treatment, sp.name AS provider_name
             FROM venue_swim_offerings o
             JOIN venues v ON o.venue_id = v.id
             JOIN swim_providers sp ON o.provider_id = sp.id
             WHERE o.diploma_track = ?
               AND v.lat BETWEEN ? AND ?
               AND v.lng BETWEEN ? AND ?
             ORDER BY o.current_waitlist_weeks_min ASC, o.monthly_price_cents ASC
             LIMIT 3`
          )
            .bind(diplomaTrack, minLat, maxLat, minLng, maxLng)
            .all();

          topOfferings = results.results ?? [];
        }
      } catch {
        // Fallback to general query if postcode_pc4 is unavailable
      }

      if (topOfferings.length === 0) {
        const fallback = await env.DB.prepare(
          `SELECT o.*, v.name AS venue_name, v.slug AS venue_slug, v.municipality_slug,
                  v.primary_water_treatment, sp.name AS provider_name
           FROM venue_swim_offerings o
           JOIN venues v ON o.venue_id = v.id
           JOIN swim_providers sp ON o.provider_id = sp.id
           WHERE o.diploma_track = ?
           ORDER BY o.current_waitlist_weeks_min ASC, o.monthly_price_cents ASC
           LIMIT 3`
        )
          .bind(diplomaTrack)
          .all();

        topOfferings = fallback.results ?? [];
      }

      return new Response(
        JSON.stringify({
          ok: true,
          idempotencyKey,
          topRecommendations: topOfferings,
        }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({
          ok: false,
          errorMessageNl: 'Er ging iets mis bij het opslaan van de aanvraag. Probeer het opnieuw.',
          error: err instanceof Error ? err.message : String(err),
        }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }
  }

  // POST /api/clicks
  if (request.method === 'POST' && path === '/api/clicks') {
    try {
      const body = await request.json() as {
        venueId?: string;
        clickTargetType?: string;
        clickDate?: string;
      };

      if (!body.venueId || !body.clickTargetType) {
        return new Response(
          JSON.stringify({ ok: false, errorMessage: 'Missing venueId or clickTargetType' }),
          {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          }
        );
      }

      const clickDate = body.clickDate || new Date().toISOString().slice(0, 10);
      await env.DB.prepare(
        `INSERT INTO outbound_click_daily_counts (click_date, venue_id, click_target_type, clicks_count)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(click_date, venue_id, click_target_type)
         DO UPDATE SET clicks_count = clicks_count + 1`
      )
        .bind(clickDate, body.venueId, body.clickTargetType)
        .run();

      return new Response(
        JSON.stringify({ ok: true, recorded: true }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }
  }

  return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
    status: 404,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 301 Permanent Redirect: www.zwemkaart.nl -> zwemkaart.nl (SEO host consolidation)
    if (url.hostname === 'www.zwemkaart.nl') {
      url.hostname = 'zwemkaart.nl';
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};
