import { describe, it, expect, vi } from 'vitest';
import { fetchWithEscalationLadder } from '@/ingestion/fetcher';

describe('3-Step Escalation Fetcher (HTTP -> Lightpanda/Obscura CDP -> Local Override)', () => {
  it('succeeds on Step 1 (HTTP fetch) when status is 200 and HTML contains target selector', async () => {
    const res = await fetchWithEscalationLadder({
      url: 'https://example.nl/rooster',
      requiresJsHydration: false,
      httpFetcher: async () => ({ status: 200, body: '<table><tr><td>07:00 - 09:30</td></tr></table>' }),
      cdpFetcher: vi.fn(),
    });

    expect(res.stepUsed).toBe('STEP_1_HTTP_FETCH');
    expect(res.html).toContain('07:00 - 09:30');
  });

  it('escalates to Step 2 (Lightpanda / Obscura CDP) when Step 1 returns 403 or requires JS hydration', async () => {
    const cdpSpy = vi.fn(async () => '<div class="hydrated-timetable">19:00 - 22:00</div>');

    const res = await fetchWithEscalationLadder({
      url: 'https://example.nl/recreatex-widget',
      requiresJsHydration: true,
      cdpEndpoint: 'http://127.0.0.1:9222',
      httpFetcher: async () => ({ status: 403, body: 'Blocked' }),
      cdpFetcher: cdpSpy,
    });

    expect(res.stepUsed).toBe('STEP_2_CDP_BROWSER');
    expect(cdpSpy).toHaveBeenCalledWith('https://example.nl/recreatex-widget', 'http://127.0.0.1:9222');
    expect(res.html).toContain('19:00 - 22:00');
  });
});
