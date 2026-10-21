import crypto from 'node:crypto';
import type { SqliteDatabase } from '../db/client';
import { findShortestWaitlistOfferingsNearPc4, type SwimOfferingRow } from '../db/queries';
import {
  WaitlistLeadInputSchema,
  buildLeadIdempotencyKey,
  type WaitlistLeadInput,
} from '../machines/sticky-widget-machine';

export interface HealthCheckResult {
  ok: boolean;
  dbConnected: boolean;
  venuesCount: number;
  timestamp: string;
}

export function handleHealthCheckQuery(db: SqliteDatabase): HealthCheckResult {
  const row = db.prepare('SELECT COUNT(*) as c FROM venues').get() as { c: number };
  return {
    ok: true,
    dbConnected: true,
    venuesCount: row.c,
    timestamp: new Date().toISOString(),
  };
}

export interface LeadSubmissionResult {
  ok: boolean;
  idempotencyKey?: string;
  topRecommendations: SwimOfferingRow[];
  errorMessageNl?: string;
}

export function handleSubmitWaitlistLeadCommand(
  db: SqliteDatabase,
  rawInput: WaitlistLeadInput,
  dateBucket = new Date().toISOString().slice(0, 10)
): LeadSubmissionResult {
  const parsed = WaitlistLeadInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      topRecommendations: [],
      errorMessageNl: parsed.error.issues[0]?.message ?? 'Ongeldige invoer.',
    };
  }

  const data = parsed.data;
  const idempotencyKey = buildLeadIdempotencyKey(
    data.parentEmail,
    data.postcodePc4,
    data.diplomaTrack,
    dateBucket
  );

  db.prepare(
    `INSERT INTO lead_requests (
      id, idempotency_key, parent_email, postcode_pc4,
      child_age_years, diploma_track, prefers_salt_water, lead_state
    ) VALUES (
      @id, @idempotency_key, @parent_email, @postcode_pc4,
      @child_age_years, @diploma_track, @prefers_salt_water, 'COMPARISON_SENT'
    )
    ON CONFLICT(idempotency_key) DO NOTHING`
  ).run({
    id: `lead-${crypto.randomUUID()}`,
    idempotency_key: idempotencyKey,
    parent_email: data.parentEmail.trim().toLowerCase(),
    postcode_pc4: data.postcodePc4,
    child_age_years: data.childAgeYears,
    diploma_track: data.diplomaTrack,
    prefers_salt_water: data.prefersSaltWater ? 1 : 0,
  });

  const topRecommendations = findShortestWaitlistOfferingsNearPc4(
    db,
    data.postcodePc4,
    data.diplomaTrack,
    15,
    3
  );

  return {
    ok: true,
    idempotencyKey,
    topRecommendations,
  };
}

export interface RecordClickInput {
  venueId: string;
  clickTargetType:
    | 'OFFICIAL_TICKETS_CALCULATOR'
    | 'OFFICIAL_ZWEMLES_SIGNUP'
    | 'OFFICIAL_WEBSITE'
    | 'GOOGLE_MAPS_ROUTE'
    | 'AFFILIATE_STUB_PRODUCT';
  clickDate?: string;
}

export function handleRecordOutboundClickCommand(
  db: SqliteDatabase,
  input: RecordClickInput
): void {
  const clickDate = input.clickDate ?? new Date().toISOString().slice(0, 10);
  db.prepare(
    `INSERT INTO outbound_click_daily_counts (click_date, venue_id, click_target_type, clicks_count)
     VALUES (@clickDate, @venueId, @clickTargetType, 1)
     ON CONFLICT(click_date, venue_id, click_target_type)
     DO UPDATE SET clicks_count = clicks_count + 1`
  ).run({
    clickDate,
    venueId: input.venueId,
    clickTargetType: input.clickTargetType,
  });
}
