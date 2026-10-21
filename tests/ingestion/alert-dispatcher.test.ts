import { describe, it, expect, vi } from 'vitest';
import { createDatabase, applyDetailedSchema } from '@/db/client';
import { recordAndDispatchAnomalyAlert } from '@/ingestion/alert-dispatcher';

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
});
