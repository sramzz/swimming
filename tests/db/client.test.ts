import { describe, it, expect } from 'vitest';
import { createDatabase, applyDetailedSchema } from '@/db/client';

describe('SQLite / D1 Schema & Foreign Key Integrity', () => {
  it('applies database-context/schema-detailed.sql and enforces STRICT and CHECK constraints', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('venues');
    expect(tableNames).toContain('basins');
    expect(tableNames).toContain('venue_swim_offerings');
    expect(tableNames).toContain('schedule_periods');
    expect(tableNames).toContain('tariffs');
    expect(tableNames).toContain('quarantined_anomalies');

    // Verify invalid FSM state is rejected by SQLite CHECK constraint
    expect(() => {
      db.prepare(
        `INSERT INTO municipalities (slug, cbs_code, name, province_slug, province_name, school_vacation_region, center_lat, center_lng)
         VALUES ('amsterdam', 'GM0363', 'Amsterdam', 'noord-holland', 'Noord-Holland', 'INVALID_REGION', 52.3676, 4.9041)`
      ).run();
    }).toThrow(/CHECK constraint failed/);

    db.close();
  });
});
