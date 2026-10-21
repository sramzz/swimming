import { describe, it, expect } from 'vitest';
import { computeContentHash, evaluateScrapedVenueSanity } from '@/ingestion/sanity-gate';

describe('SHA-256 Diff & Zod Sanity Quarantine Gate', () => {
  it('returns UNCHANGED_NOOP when raw content hash matches last verified hash', () => {
    const rawHtml = '<html><body>Tarief 2026: € 8,20</body></html>';
    const hash = computeContentHash(rawHtml);

    const decision = evaluateScrapedVenueSanity({
      venueSlug: 'de-mirandabad',
      isPaidPool: true,
      rawContent: rawHtml,
      previousContentHash: hash,
      previousSlotsCount: 12,
      extractedAdultPriceCents: 820,
      extractedSlotsCount: 12,
    });

    expect(decision.status).toBe('UNCHANGED_NOOP');
  });

  it('quarantines scrape when extracted adult price is € 0,00 on a paid pool', () => {
    const decision = evaluateScrapedVenueSanity({
      venueSlug: 'de-mirandabad',
      isPaidPool: true,
      rawContent: '<html><body>Redesigned broken table</body></html>',
      previousContentHash: 'old-hash',
      previousSlotsCount: 12,
      extractedAdultPriceCents: 0,
      extractedSlotsCount: 12,
    });

    expect(decision.status).toBe('QUARANTINED_ANOMALY');
    expect(decision.errorCode).toBe('SANITY_PRICE_OUT_OF_RANGE');
    expect(decision.localFixCommand).toBe('pnpm sync:venue --slug=de-mirandabad --inspect');
  });

  it('quarantines scrape when schedule slots drop by more than 50%', () => {
    const decision = evaluateScrapedVenueSanity({
      venueSlug: 'sportfondsenbad-oost',
      isPaidPool: true,
      rawContent: '<html><body>Partial load</body></html>',
      previousContentHash: 'old-hash',
      previousSlotsCount: 14,
      extractedAdultPriceCents: 650,
      extractedSlotsCount: 2,
    });

    expect(decision.status).toBe('QUARANTINED_ANOMALY');
    expect(decision.errorCode).toBe('SANITY_SLOTS_DROP_EXCEEDED');
  });

  it('approves valid scrape with VERIFIED_PROMOTE when all invariants pass', () => {
    const decision = evaluateScrapedVenueSanity({
      venueSlug: 'de-mirandabad',
      isPaidPool: true,
      rawContent: '<html><body>Updated 2026 tariff € 8,50</body></html>',
      previousContentHash: 'old-hash',
      previousSlotsCount: 12,
      extractedAdultPriceCents: 850,
      extractedSlotsCount: 12,
    });

    expect(decision.status).toBe('VERIFIED_PROMOTE');
  });
});
