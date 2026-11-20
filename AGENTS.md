# Zwemkaart.nl (AlleZwembaden.nl) — Agent & Contributor Instructions

> **North Star ([`PHILOSOPHY.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/PHILOSOPHY.md)):** *Reliable software builds trust — trust is our biggest asset.*

---

## 1. Non-Negotiable Engineering Rules

1. **Test-Driven Development (TDD):** Always follow Red $\rightarrow$ Green $\rightarrow$ Refactor. Write failing Vitest tests in `tests/` first, confirm they fail for the expected invariant, then implement minimal, well-typed TypeScript code.
2. **Pure Domain & Ingestion Separation (CQS):**
   * Functions in `src/domain/` and `src/ingestion/` MUST be pure (zero network, filesystem, or SQLite/D1 I/O).
   * Separate state-mutating Commands from side-effect-free Queries.
3. **Zero Warnings & Strict Types:** Every change must pass `pnpm lint` (`oxlint --deny-warnings src tests`) and `pnpm typecheck` (`astro check`) with **0 errors, 0 warnings, and 0 `any` casts**.
4. **Idempotency & True-Diff Tracking:** Ingestion and database syncs must remain idempotent (`ON CONFLICT` updates, `content_hash`-gated `lastmod_at` bumps, and surgical D1 diffs).

---

## 2. Essential Specifications & Lessons (Read Before Editing)

* **System Specification:** [`docs/specs/001-system-and-functional-specification.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/specs/001-system-and-functional-specification.md)
* **Feature Spec (Open Now / Lap Swimming):** [`docs/specs/002-banenzwemmen-nu-open.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/specs/002-banenzwemmen-nu-open.md)
* **Programmatic SEO & Audit Spec (`4,861` Pages):** [`docs/specs/003-programmatic-seo-at-scale.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/specs/003-programmatic-seo-at-scale.md)
* **Lessons Learned (Pay Once):**
  * [`docs/lessons/README.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/lessons/README.md)
  * [`docs/lessons/seo-and-cwv.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/lessons/seo-and-cwv.md) — Soft-404 facet link parity (`getAvailableCityIntents`), BAG seat suppression (`isDistinctSubWoonplaats`), homonym/beach disambiguation, and D1 Free Tier quota safety
  * [`docs/lessons/sqlite-d1-and-data.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/lessons/sqlite-d1-and-data.md) — Zwemwater.nl enrichment, official-first photos, and 4-tier Dutch geography (`Provincie` $\rightarrow$ `Gemeente` $\rightarrow$ `Woonplaats` $\rightarrow$ `PC4`)
  * [`docs/lessons/frontend-islands-and-maplibre.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/lessons/frontend-islands-and-maplibre.md) — MapLibre marker wrapper isolation and zero-dead-link rules
* **Database Context:** [`database-context/SCHEMA_FOR_DUMMIES.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/database-context/SCHEMA_FOR_DUMMIES.md), [`database-context/schema-detailed.sql`](file:///Users/sramzzs4d/Projects-sramzz/swimming/database-context/schema-detailed.sql), and [`database-context/run-history.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/database-context/run-history.md)

---

## 3. Cloudflare Account & D1 Quota Guardrails

* **Profile Enforcement:** Always verify `pnpm cf:profile:check` before Cloudflare operations so commands only target profile **`allezwembaden`** (`allezwembaden-db` / worker `zwemkaart-nl`). Never bypass `src/cli/verify-cf-profile.ts`.
* **D1 Free Tier (`100k` Row Writes/Day) Discipline:**
  * Astro SSG builds (`pnpm build`) read strictly from local SQLite (`data/allezwembaden.sqlite`, `0` remote D1 writes).
  * For routine venue updates or deduplication syncs to remote Cloudflare D1, **always** use surgical delta sync:
    ```bash
    # Dry-run inspect generated SQL in .wrangler/d1-delta-sync.sql
    pnpm tsx src/cli/sync-remote-d1.ts --delta-venues --generate-only

    # Execute surgical deletes/updates/inserts (skips cleanly if 0 changes)
    pnpm tsx src/cli/sync-remote-d1.ts --delta-venues
    ```
  * Avoid running full-table `pnpm cf:d1:sync` unnecessarily; use `--generate-only` to inspect `.wrangler/d1-full-sync.sql` first.

---

## 4. Mandatory Verification Gate (Before Any Deploy or PR)

Run sequentially and verify **0 warnings, 0 errors, 0 SEO audit failures**:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit:seo
```

Deploy only after `pnpm audit:seo` passes all 14 post-build checks across `dist/` and `dist/sitemap.xml`:

```bash
pnpm cf:deploy
```
