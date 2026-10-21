import { describe, it, expect } from 'vitest';
import { createDatabase, applyDetailedSchema } from '@/db/client';
import { seedInitialDataset } from '@/db/seed';
import {
  handleHealthCheckQuery,
  handleSubmitWaitlistLeadCommand,
  handleRecordOutboundClickCommand,
} from '@/api/handlers';

describe('Edge API Handlers: Health, Idempotent Leads & Click Telemetry', () => {
  it('returns healthy status from handleHealthCheckQuery', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);
    seedInitialDataset(db);

    const health = handleHealthCheckQuery(db);
    expect(health.ok).toBe(true);
    expect(health.venuesCount).toBeGreaterThanOrEqual(6);
    db.close();
  });

  it('inserts waitlist lead idempotently and returns top 3 shortest-waitlist schools near PC4', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);
    seedInitialDataset(db);

    const payload = {
      parentEmail: 'sanne@example.nl',
      postcodePc4: '1079',
      childAgeYears: 4.5,
      diplomaTrack: 'DIPLOMA_A' as const,
      prefersSaltWater: true,
    };

    const first = handleSubmitWaitlistLeadCommand(db, payload, '2026-10-21');
    const second = handleSubmitWaitlistLeadCommand(db, payload, '2026-10-21'); // Duplicate submission!

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(first.topRecommendations.length).toBeGreaterThanOrEqual(2);

    const totalLeads = (
      db.prepare('SELECT COUNT(*) as c FROM lead_requests').get() as { c: number }
    ).c;
    expect(totalLeads).toBe(1); // Strictly 1 row despite 2 submissions!
    db.close();
  });

  it('increments daily outbound click counts per venue and target type', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);
    seedInitialDataset(db);

    handleRecordOutboundClickCommand(db, {
      venueId: 'venue-de-mirandabad',
      clickTargetType: 'OFFICIAL_TICKETS_CALCULATOR',
      clickDate: '2026-10-21',
    });
    handleRecordOutboundClickCommand(db, {
      venueId: 'venue-de-mirandabad',
      clickTargetType: 'OFFICIAL_TICKETS_CALCULATOR',
      clickDate: '2026-10-21',
    });

    const row = db
      .prepare(
        `SELECT clicks_count FROM outbound_click_daily_counts
         WHERE venue_id = 'venue-de-mirandabad' AND click_date = '2026-10-21'`
      )
      .get() as { clicks_count: number };
    expect(row.clicks_count).toBe(2);
    db.close();
  });
});
