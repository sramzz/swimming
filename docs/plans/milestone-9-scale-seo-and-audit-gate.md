# Milestone 9: Scale SEO Integrity, Physical Pool Deduplication, Post-Build Audit Gate & Surgical D1 Sync

**Status:** Complete (All 6 tasks + Milestone 9 Gate verified)
**Goal:** Eliminate `1,613` broken facet links, `113` duplicate `<title>` tags, `103` duplicate `<meta name="description">` tags, and `24` duplicate physical venue records across the `4,861`-page national static build; enforce a 14-invariant post-build audit gate (`pnpm audit:seo`); synchronize remote Cloudflare D1 within Free Tier (`100k` row writes/day) limits via surgical `--delta-venues`; and deploy cleanly to `https://zwemkaart.nl`.

---

## Architecture Summary

1. **14-Invariant Post-Build `dist/` Audit Gate (`src/cli/audit-dist-seo.ts`, `pnpm audit:seo`):**
   - Recursively audits every generated `.html` file (`4,862` total, `4,861` indexable + `404.html`), `dist/sitemap.xml`, `og:image` static assets, JSON-LD blocks, canonical links, bad tokens (`undefined`, `NaN`, `[object Object]`), and all `431,903` internal `<a href>` targets.
2. **Zero-404 Facet Linking & BAG Seat / Collision Suppression:**
   - `getAvailableCityIntents` (`src/domain/seo-aggregator.ts`) ensures `/steden/[stad]` and `/steden/[stad]/[intent]` only link to facets with `>= 1` matching venue.
   - `isDistinctSubWoonplaats` & `resolveLocationBySlug` (`src/db/queries.ts`) plus `municipalitySlugSet` / `isCollidingMunicipalitySlug` guards suppress province-suffixed eponymous BAG seats (`hoorn-nh`, `beuningen-gld`, `voorst-gd-voorst`) and colliding municipal slugs (`beuningen` in Losser).
3. **Physical Pool Deduplication & Unique Disambiguated SEO Copy:**
   - `isPhysicalDuplicate` & `deduplicatePhysicalPools` (`src/cli/harvest-national-pools.ts`) eliminate `24` duplicate venue rows (`1,641` $\rightarrow$ `1,617` unique venues across `332` municipalities and `656` non-colliding distinct sub-woonplaatsen).
   - `formatCitySeoDisplayName`, `buildCityHubTitleNl`, `buildCitySeoSummaryNl`, `buildCityIntentSeoMeta`, `buildVenuePageSeoMeta` (`src/domain/seo-aggregator.ts`) and `disambiguateZwemwaterName` / `disambiguateMunicipalitySpots` (`src/cli/ingest-national.ts`) ensure 100% unique `<title>` and `<meta name="description">` across homonym villages (`Buren (Ameland)`), homonym pools (`De Driesprong`), and multi-checkpoint beaches (`Zandvoort`, `Bergen`).
4. **Surgical Cloudflare D1 Venue Delta Sync (`src/cli/sync-remote-d1.ts`):**
   - Supports `--generate-only` (writes `.wrangler/d1-full-sync.sql` or `.wrangler/d1-delta-sync.sql` without remote writes) and `--delta-venues` (read-only remote D1 comparison against `data/allezwembaden.sqlite`, emitting FK-safe `DELETE` cascades, `UPDATE`s, and `INSERT OR REPLACE`s).

---

## Completed Tasks

- [x] **Task 9.1: Post-Build `dist/` SEO & Internal Link Audit Gate + JSON-LD Completeness**
  - Created `src/cli/audit-dist-seo.ts` (`auditDistDirectory`, `hasAuditFailures`) and registered `"audit:seo": "tsx src/cli/audit-dist-seo.ts"` in `package.json`.
  - Added `WebPage` + `BreadcrumbList` JSON-LD to `src/pages/aanbieder.astro` and `CollectionPage` + `BreadcrumbList` JSON-LD to `src/pages/steden/index.astro`.
  - Added extraction, normalization, and synthetic fixture unit tests in `tests/pages/seo-build.test.ts`.

- [x] **Task 9.2: Zero Broken Facet Links & Eponymous BAG Seat / Collision Suppression**
  - Exported `getAvailableCityIntents` (`src/domain/seo-aggregator.ts`) and wired it into `src/pages/steden/[stad]/index.astro` and `src/pages/steden/[stad]/[intent].astro`, eliminating `1,613` broken facet pill links.
  - Added `isDistinctSubWoonplaats` & `resolveLocationBySlug` (`src/db/queries.ts`) + collision guards in `src/pages/steden/index.astro`, `src/pages/steden/[stad]/[intent].astro`, and `src/pages/zwembad/[stad]/[slug].astro`, verified in `tests/db/queries.test.ts`.

- [x] **Task 9.3: Physical Pool Deduplication (`1,641` $\rightarrow$ `1,617` Venues)**
  - Added `isPhysicalDuplicate`, `deduplicatePhysicalPools`, `normalizeStreetAndNumber`, `extractNameTokens`, `hasMeaningfulTokenOverlap`, and `GOLD_STANDARD_SEEDS` in `src/cli/harvest-national-pools.ts` (`tests/cli/harvest-national-pools.test.ts`).
  - Re-harvested `src/data/curated-pools.json` and re-ingested SQLite (`1,617` active venues across `332` municipalities and `656` non-colliding distinct sub-woonplaatsen).

- [x] **Task 9.4: Unique Programmatic Metadata & Beach Checkpoint Disambiguation**
  - Implemented `formatCitySeoDisplayName`, `buildCityIntentSeoMeta`, and `buildVenuePageSeoMeta` in `src/domain/seo-aggregator.ts` (`tests/domain/seo-aggregator.test.ts`).
  - Implemented `cleanVenueName`, `extractStreetPrefix`, `disambiguateZwemwaterName`, and `disambiguateMunicipalitySpots` in `src/cli/ingest-national.ts` (`tests/db/queries.test.ts`), resolving all `113` duplicate titles and `103` duplicate descriptions.

- [x] **Task 9.5: `dist/` SEO Gate Verification & `page-empty` Negative Fixture Hardening**
  - Verified `pnpm audit:seo` across `dist/` and added `page-empty/index.html` negative fixture assertions in `tests/pages/seo-build.test.ts` covering `missingTitle`, `missingDescription`, `missingH1`, `missingOgImage`, and `missingJsonLd`.

- [x] **Task 9.6: Scale SEO Docs, Surgical Remote D1 Delta Sync & Production Deploy**
  - Implemented `--generate-only` and `--delta-venues` in `src/cli/sync-remote-d1.ts`, executed surgical delta (`24` deletes, `84` updates, `0` inserts = `348` SQL statements) bringing remote `allezwembaden-db` to `1,617` venues, and verified idempotent re-run (`0` deletes, `0` updates, `0` inserts).
  - Authored [`docs/specs/003-programmatic-seo-at-scale.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/specs/003-programmatic-seo-at-scale.md), [`docs/lessons/seo-and-cwv.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/lessons/seo-and-cwv.md), [`AGENTS.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/AGENTS.md), this milestone plan, and updated [`docs/plans/000-master-implementation-plan.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/plans/000-master-implementation-plan.md).
  - Deployed to Cloudflare Workers (`zwemkaart-nl`) via `pnpm cf:deploy` and verified live production routes.

---

## Verified Milestone 9 Gate Results

- **Remote D1 Sync (`allezwembaden-db` via profile `allezwembaden`):**
  - Delta run 1: `24` deletes, `84` updates, `0` inserts (`348` SQL statements in `.wrangler/d1-delta-sync.sql`), remote `venuesCount = 1617`.
  - Delta run 2 (idempotency check): `0` deletes, `0` updates, `0` inserts (skipped remote write cleanly).
- **Post-Build `pnpm audit:seo` (`dist/`):**
  - `Total HTML Files: 4,862` | `Total Indexable Pages: 4,861` | `Sitemap URLs: 4,861` | `Internal Links Checked: 431,903`
  - `0` missing/duplicate titles, `0` missing/duplicate meta descriptions, `0` missing `<h1>`, `0` canonical mismatches, `0` sitemap/dist mismatches, `0` missing/invalid JSON-LD, `0` missing/broken `og:image`, `0` bad tokens, `0` broken internal links.
- **Automated Checks:**
  - `pnpm lint` (`oxlint --deny-warnings src tests`): 0 warnings, 0 errors
  - `pnpm typecheck` (`astro check`): 0 errors, 0 warnings, 0 hints
  - `pnpm test` (`vitest run`): 27 test files, 173 tests passed
  - `pnpm build`: `4,862` static pages + Cloudflare Build Output v0 generated cleanly
