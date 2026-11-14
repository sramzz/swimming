import { describe, it, expect, vi } from 'vitest';
import worker, { handleApiRequest, type Env } from '@/worker';

function createMockEnv(): { env: Env; runMock: ReturnType<typeof vi.fn>; allMock: ReturnType<typeof vi.fn> } {
  const runMock = vi.fn().mockResolvedValue({ success: true });
  const allMock = vi.fn().mockResolvedValue({
    results: [
      {
        id: 'offering-1',
        venue_name: 'De Mirandabad',
        provider_name: 'Zwemvereniging De Dolfijn',
        diploma_track: 'DIPLOMA_A',
        current_waitlist_weeks_min: 6,
        current_waitlist_weeks_max: 8,
        monthly_price_cents: 6450,
      },
    ],
  });
  const firstMock = vi.fn().mockImplementation(() => Promise.resolve({ c: 1002, lat: 52.34, lng: 4.90 }));

  const statementMock = {
    bind: vi.fn().mockReturnThis(),
    first: firstMock,
    all: allMock,
    run: runMock,
  };

  const dbMock = {
    prepare: vi.fn().mockReturnValue(statementMock),
  };

  const assetsMock = {
    fetch: vi.fn().mockResolvedValue(new Response('<html>Static Asset</html>', { status: 200 })),
  };

  return {
    env: { DB: dbMock as unknown as Env['DB'], ASSETS: assetsMock },
    runMock,
    allMock,
  };
}

describe('Cloudflare Worker Edge API & Asset Routing', () => {
  it('handles GET /api/health with D1 count', async () => {
    const { env } = createMockEnv();
    const req = new Request('https://zwemkaart.nl/api/health', { method: 'GET' });
    const res = await handleApiRequest(req, env);

    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean; dbConnected: boolean; venuesCount: number };
    expect(data.ok).toBe(true);
    expect(data.dbConnected).toBe(true);
    expect(data.venuesCount).toBe(1002);
  });

  it('handles HEAD /api/health with 200 OK for monitoring probes', async () => {
    const { env } = createMockEnv();
    const req = new Request('https://zwemkaart.nl/api/health', { method: 'HEAD' });
    const res = await handleApiRequest(req, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });

  it('rejects invalid lead submission with 400', async () => {
    const { env } = createMockEnv();
    const req = new Request('https://zwemkaart.nl/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentEmail: 'invalid', postcodePc4: '99' }),
    });
    const res = await handleApiRequest(req, env);

    expect(res.status).toBe(400);
    const data = await res.json() as { ok: boolean; errorMessageNl: string };
    expect(data.ok).toBe(false);
    expect(data.errorMessageNl).toContain('postcode');
  });

  it('persists valid lead in D1 and returns top recommendations', async () => {
    const { env, runMock } = createMockEnv();
    const req = new Request('https://zwemkaart.nl/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parentEmail: 'ouder@example.nl',
        postcodePc4: '1079',
        childAgeYears: 5,
        diplomaTrack: 'DIPLOMA_A',
        prefersSaltWater: true,
      }),
    });
    const res = await handleApiRequest(req, env);

    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean; idempotencyKey: string; topRecommendations: unknown[] };
    expect(data.ok).toBe(true);
    expect(data.idempotencyKey).toContain('ouder@example.nl:1079:DIPLOMA_A:');
    expect(data.topRecommendations.length).toBeGreaterThan(0);
    expect(runMock).toHaveBeenCalled();
  });

  it('records outbound click in D1 outbound_click_daily_counts', async () => {
    const { env, runMock } = createMockEnv();
    const req = new Request('https://zwemkaart.nl/api/clicks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venueId: 'v-mirandabad',
        clickTargetType: 'OFFICIAL_TICKETS_CALCULATOR',
      }),
    });
    const res = await handleApiRequest(req, env);

    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean; recorded: boolean };
    expect(data.ok).toBe(true);
    expect(data.recorded).toBe(true);
    expect(runMock).toHaveBeenCalled();
  });

  it('redirects http://zwemkaart.nl/steden permanently (301) to https://zwemkaart.nl/steden with HSTS', async () => {
    const { env } = createMockEnv();
    const req = new Request('http://zwemkaart.nl/steden', { method: 'GET' });
    const res = await worker.fetch(req, env);

    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('https://zwemkaart.nl/steden');
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
  });

  it('collapses http://www.zwemkaart.nl/provincies/drenthe/ to canonical HTTPS apex without trailing slash in a single 301 hop', async () => {
    const { env } = createMockEnv();
    const req = new Request('http://www.zwemkaart.nl/provincies/drenthe/', { method: 'GET' });
    const res = await worker.fetch(req, env);

    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('https://zwemkaart.nl/provincies/drenthe');
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
  });

  it('redirects https://www.zwemkaart.nl/aanbieder permanently (301) to https://zwemkaart.nl/aanbieder', async () => {
    const { env } = createMockEnv();
    const req = new Request('https://www.zwemkaart.nl/aanbieder', { method: 'GET' });
    const res = await worker.fetch(req, env);

    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('https://zwemkaart.nl/aanbieder');
  });

  it('redirects https://zwemkaart.nl/steden/ permanently (301) to https://zwemkaart.nl/steden', async () => {
    const { env } = createMockEnv();
    const req = new Request('https://zwemkaart.nl/steden/', { method: 'GET' });
    const res = await worker.fetch(req, env);

    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('https://zwemkaart.nl/steden');
  });

  it('delegates canonical HTTPS requests to env.ASSETS.fetch with HSTS and nosniff security headers', async () => {
    const { env } = createMockEnv();
    const req = new Request('https://zwemkaart.nl/zwembad/amsterdam/noorderparkbad', { method: 'GET' });
    const res = await worker.fetch(req, env);

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toBe('<html>Static Asset</html>');
    expect(env.ASSETS?.fetch).toHaveBeenCalled();
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
