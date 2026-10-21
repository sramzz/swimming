import crypto from 'node:crypto';

export interface SanityCheckInput {
  venueSlug: string;
  isPaidPool: boolean;
  rawContent: string;
  previousContentHash: string | null;
  previousSlotsCount: number;
  extractedAdultPriceCents: number | null;
  extractedSlotsCount: number;
}

export interface SanityDecision {
  status: 'UNCHANGED_NOOP' | 'VERIFIED_PROMOTE' | 'QUARANTINED_ANOMALY';
  contentHash: string;
  errorCode: string | null;
  errorDetail: string | null;
  localFixCommand: string;
}

export function computeContentHash(rawContent: string): string {
  return crypto.createHash('sha256').update(rawContent, 'utf-8').digest('hex');
}

export function evaluateScrapedVenueSanity(input: SanityCheckInput): SanityDecision {
  const contentHash = computeContentHash(input.rawContent);
  const localFixCommand = `pnpm sync:venue --slug=${input.venueSlug} --inspect`;

  if (input.previousContentHash && input.previousContentHash === contentHash) {
    return {
      status: 'UNCHANGED_NOOP',
      contentHash,
      errorCode: null,
      errorDetail: null,
      localFixCommand,
    };
  }

  if (input.isPaidPool) {
    if (
      input.extractedAdultPriceCents === null ||
      input.extractedAdultPriceCents < 150 ||
      input.extractedAdultPriceCents > 3500
    ) {
      return {
        status: 'QUARANTINED_ANOMALY',
        contentHash,
        errorCode: 'SANITY_PRICE_OUT_OF_RANGE',
        errorDetail: `Expected adult ticket between 150 and 3500 cents, got ${String(input.extractedAdultPriceCents)}`,
        localFixCommand,
      };
    }
  }

  if (
    input.previousSlotsCount > 0 &&
    input.extractedSlotsCount < Math.ceil(input.previousSlotsCount * 0.5)
  ) {
    return {
      status: 'QUARANTINED_ANOMALY',
      contentHash,
      errorCode: 'SANITY_SLOTS_DROP_EXCEEDED',
      errorDetail: `Extracted ${input.extractedSlotsCount} slots vs previous ${input.previousSlotsCount} (>50% drop)`,
      localFixCommand,
    };
  }

  return {
    status: 'VERIFIED_PROMOTE',
    contentHash,
    errorCode: null,
    errorDetail: null,
    localFixCommand,
  };
}
