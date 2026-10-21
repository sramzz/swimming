import { describe, it, expect } from 'vitest';
import { createDatabase, applyDetailedSchema } from '@/db/client';
import { seedInitialDataset } from '@/db/seed';
import { resolveSafeAffiliateStubRedirect } from '@/domain/affiliate-stub';

describe('Security-Hardened Affiliate Stub', () => {
  it('returns null when stub is disabled (default at launch) or when an unknown/malicious slug is passed', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);
    seedInitialDataset(db);

    // Disabled by default
    expect(resolveSafeAffiliateStubRedirect(db, 'neopreen-wetsuit-4mm')).toBeNull();
    // Arbitrary URL injection attempt
    expect(resolveSafeAffiliateStubRedirect(db, 'https://evil.example.com')).toBeNull();

    // Enable the stub explicitly and verify safe resolution
    db.prepare("UPDATE affiliate_product_stubs SET is_enabled = 1 WHERE slug = 'neopreen-wetsuit-4mm'").run();
    const resolved = resolveSafeAffiliateStubRedirect(db, 'neopreen-wetsuit-4mm');
    expect(resolved?.target_url).toBe('https://allezwembaden.nl/#wetsuit-stub');

    db.close();
  });
});
