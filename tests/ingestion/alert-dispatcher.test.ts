import { describe, it, expect, vi } from 'vitest';
import { createDatabase, applyDetailedSchema } from '@/db/client';
import {
  recordAndDispatchAnomalyAlert,
  createMultiChannelAlertSender,
} from '@/ingestion/alert-dispatcher';

describe('Quarantine Webhook Alert Dispatcher with 24h Cooldown FSM', () => {
  it('sends webhook alert on first anomaly and suppresses duplicate alert within 24 hours', async () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);

    db.prepare(
      `INSERT INTO ingestion_runs (run_id, runner_env, job_type, run_state)
       VALUES ('run-1', 'GITHUB_ACTIONS', 'POOL_SCRAPE', 'COMPLETED_WITH_QUARANTINES')`
    ).run();

    const webhookSender = vi.fn(async () => ({ ok: true }));

    const first = await recordAndDispatchAnomalyAlert(db, {
      runId: 'run-1',
      venueSlug: 'de-mirandabad',
      failureStep: 'SANITY_INVARIANT',
      errorCode: 'SANITY_PRICE_OUT_OF_RANGE',
      errorDetail: 'Got 0 cents',
      snapshotFilePath: 'logs/anomalies/2026-10-21_de-mirandabad.html',
      nowIso: '2026-10-21T06:00:00Z',
      webhookSender,
    });

    // Second failure 2 hours later for the same venue + errorCode
    const second = await recordAndDispatchAnomalyAlert(db, {
      runId: 'run-1',
      venueSlug: 'de-mirandabad',
      failureStep: 'SANITY_INVARIANT',
      errorCode: 'SANITY_PRICE_OUT_OF_RANGE',
      errorDetail: 'Got 0 cents again',
      snapshotFilePath: 'logs/anomalies/2026-10-21_de-mirandabad.html',
      nowIso: '2026-10-21T08:00:00Z',
      webhookSender,
    });

    expect(first.alertState).toBe('WEBHOOK_ALERT_SENT');
    expect(second.alertState).toBe('SUPPRESSED_COOLDOWN');
    expect(webhookSender).toHaveBeenCalledTimes(1);
    expect(first.formattedMessage).toContain('pnpm sync:venue --slug=de-mirandabad --inspect');

    db.close();
  });

  it('formats payload for Telegram sendMessage API and pings Self-Hosted Uptime Kuma Push URL when configured', async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init });
      return { ok: true } as Response;
    });

    const sender = createMultiChannelAlertSender({
      telegramOrWebhookUrl:
        'https://api.telegram.org/bot12345:ABCDEF/sendMessage?chat_id=987654',
      uptimeKumaPushUrl: 'https://kuma.example.nl/api/push/abc123xyz',
      fetcher: mockFetch,
    });

    const res = await sender('⚠️ [AlleZwembaden Quarantaine] venue=de-mirandabad');
    expect(res.ok).toBe(true);
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0].url).toContain('api.telegram.org/bot12345:ABCDEF/sendMessage');
    expect(JSON.parse(String(fetchCalls[0].init?.body))).toEqual({
      chat_id: '987654',
      text: '⚠️ [AlleZwembaden Quarantaine] venue=de-mirandabad',
    });
    expect(fetchCalls[1].url).toContain(
      'https://kuma.example.nl/api/push/abc123xyz?status=down&msg='
    );
  });
});
