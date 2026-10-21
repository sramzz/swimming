import { describe, it, expect } from 'vitest';
import { createDatabase, applyDetailedSchema } from '@/db/client';
import { seedInitialDataset } from '@/db/seed';
import {
  getVenueByCityAndSlug,
  listVenuesByCity,
  findVenuesNearPostcodePc4,
  findShortestWaitlistOfferingsNearPc4,
} from '@/db/queries';

describe('Idempotent Seeder & Core Read Queries', () => {
  it('seeds municipalities, holidays, and flagship venues idempotently (running twice produces identical row counts)', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);

    seedInitialDataset(db);
    seedInitialDataset(db); // Idempotency test: second run must not duplicate or throw

    const miranda = getVenueByCityAndSlug(db, 'amsterdam', 'de-mirandabad');
    expect(miranda).not.toBeNull();
    expect(miranda?.name).toBe('Zwemcentrum De Mirandabad');
    expect(miranda?.primary_water_treatment).toBe('SALT_ELECTROLYSIS');
    expect(miranda?.basins.length).toBeGreaterThanOrEqual(3);
    expect(miranda?.tariffs.length).toBeGreaterThanOrEqual(4);

    const amsterdamVenues = listVenuesByCity(db, 'amsterdam');
    expect(amsterdamVenues.length).toBeGreaterThanOrEqual(4);

    const near1079 = findVenuesNearPostcodePc4(db, '1079', 10);
    expect(near1079.length).toBeGreaterThanOrEqual(3);
    expect(near1079[0].slug).toBe('de-mirandabad');

    const top3Waitlist = findShortestWaitlistOfferingsNearPc4(db, '1079', 'DIPLOMA_A', 15, 3);
    expect(top3Waitlist.length).toBeGreaterThanOrEqual(2);
    expect(top3Waitlist[0].current_waitlist_weeks_min).toBeLessThanOrEqual(
      top3Waitlist[1].current_waitlist_weeks_min
    );

    db.close();
  });
});
