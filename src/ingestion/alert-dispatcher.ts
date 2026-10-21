import crypto from 'node:crypto';
import type { SqliteDatabase } from '../db/client';

export interface AnomalyAlertInput {
  runId: string;
  venueSlug: string;
  failureStep: 'HTTP_FETCH_STEP1' | 'CDP_BROWSER_STEP2' | 'ZOD_PARSE' | 'SANITY_INVARIANT';
  errorCode: string;
  errorDetail: string;
  snapshotFilePath: string | null;
  nowIso?: string;
  webhookSender?: (message: string) => Promise<{ ok: boolean }>;
}

export interface AnomalyAlertOutcome {
  alertState: 'WEBHOOK_ALERT_SENT' | 'SUPPRESSED_COOLDOWN';
  formattedMessage: string;
}

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function recordAndDispatchAnomalyAlert(
  db: SqliteDatabase,
  input: AnomalyAlertInput
): Promise<AnomalyAlertOutcome> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const localFixCommand = `pnpm sync:venue --slug=${input.venueSlug} --inspect`;

  const recentAlert = db
    .prepare(
      `SELECT last_alerted_at FROM quarantined_anomalies
       WHERE venue_slug = ? AND error_code = ? AND alert_state = 'WEBHOOK_ALERT_SENT'
         AND resolved_at IS NULL
       ORDER BY last_alerted_at DESC LIMIT 1`
    )
    .get(input.venueSlug, input.errorCode) as { last_alerted_at: string | null } | undefined;

  const isWithinCooldown =
    recentAlert?.last_alerted_at &&
    Date.parse(nowIso) - Date.parse(recentAlert.last_alerted_at) < COOLDOWN_MS;

  const alertState = isWithinCooldown ? 'SUPPRESSED_COOLDOWN' : 'WEBHOOK_ALERT_SENT';

  const formattedMessage = [
    `⚠️ [AlleZwembaden Quarantaine] venue=${input.venueSlug}`,
    `Reden: ${input.errorCode} (${input.errorDetail})`,
    input.snapshotFilePath ? `Snapshot: ${input.snapshotFilePath}` : null,
    `👉 Lokaal herstellen op Mac: ${localFixCommand}`,
  ]
    .filter(Boolean)
    .join('\n');

  db.prepare(
    `INSERT INTO quarantined_anomalies (
      id, run_id, venue_slug, failure_step, error_code, error_detail,
      snapshot_file_path, local_fix_command, alert_state, last_alerted_at, created_at
    ) VALUES (
      @id, @runId, @venueSlug, @failureStep, @errorCode, @errorDetail,
      @snapshotFilePath, @localFixCommand, @alertState, @lastAlertedAt, @createdAt
    )`
  ).run({
    id: `anom-${crypto.randomUUID()}`,
    runId: input.runId,
    venueSlug: input.venueSlug,
    failureStep: input.failureStep,
    errorCode: input.errorCode,
    errorDetail: input.errorDetail,
    snapshotFilePath: input.snapshotFilePath,
    localFixCommand,
    alertState,
    lastAlertedAt: alertState === 'WEBHOOK_ALERT_SENT' ? nowIso : null,
    createdAt: nowIso,
  });

  if (alertState === 'WEBHOOK_ALERT_SENT' && input.webhookSender) {
    await input.webhookSender(formattedMessage);
  }

  return {
    alertState,
    formattedMessage,
  };
}
