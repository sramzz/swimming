import type { SqliteDatabase } from '../db/client';

const SAFE_SLUG_REGEX = /^[a-z0-9-]{2,64}$/;

export interface AffiliateStubItem {
  slug: string;
  context_rule: string;
  title_nl: string;
  target_url: string;
}

export function resolveSafeAffiliateStubRedirect(
  db: SqliteDatabase,
  slug: string
): AffiliateStubItem | null {
  if (!SAFE_SLUG_REGEX.test(slug)) {
    return null;
  }

  const row = db
    .prepare(
      'SELECT slug, context_rule, title_nl, target_url FROM affiliate_product_stubs WHERE slug = ? AND is_enabled = 1'
    )
    .get(slug) as AffiliateStubItem | undefined;

  return row ?? null;
}
