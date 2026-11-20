# Lessons Learned: Programmatic SEO, Audit Gates & Cloudflare D1 Quota Discipline

> **Rule ([`PHILOSOPHY.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/PHILOSOPHY.md#L85)):** *"Every mistake and experiment failed becomes part of a Markdown file, we have a markdown file for different types of mistakes. We pay for a lesson once!"*

---

## Lesson 1: Unconditional Facet Links + Soft-404 Exclusion Create Broken Internal Links (`1,613` Dead Links)

### What Happened
During Milestone 8, [`src/pages/steden/[stad]/[intent].astro`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/pages/steden/[stad]/[intent].astro) and [`src/pages/sitemap.xml.ts`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/pages/sitemap.xml.ts) correctly gated route generation with `shouldGenerateIndexableFacetPage(matching.length >= 1)` so empty `/banenzwemmen`, `/zwemles`, or `/buitenwater` pages were never built. However, [`src/pages/steden/[stad]/index.astro`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/pages/steden/[stad]/index.astro) and `[intent].astro` still rendered all three intent navigation pills unconditionally. Towns with only open-water spots linked to non-existent `/banenzwemmen` and `/zwemles` pages, and towns with only indoor pools linked to non-existent `/buitenwater` pages — producing **`1,613` broken internal links** across `dist/`.

### Prevention Rule (Mandatory)
- **Single Source of Truth Between Link Emitters & `getStaticPaths()`:** Every UI component rendering links to programmatic facet routes MUST filter via `getAvailableCityIntents(venues)` ([`src/domain/seo-aggregator.ts`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/domain/seo-aggregator.ts)), which uses the exact same `matchesIntent` and `shouldGenerateIndexableFacetPage` predicates as `getStaticPaths()` and `sitemap.xml.ts`.

---

## Lesson 2: Province-Suffixed BAG Seats, Homonyms & Multi-Checkpoint Beaches Cause Mass Duplicate Metadata (`113` Titles / `103` Descriptions)

### What Happened
At national scale (`4,800+` pages), three subtle geographic/naming collisions produced **`113` duplicate `<title>` tags** and **`103` duplicate `<meta name="description">` tags**:
1. **Eponymous Municipality Seats with BAG Suffixes:** Kadaster BAG includes province-suffixed seat records like `Beuningen Gld` (`beuningen-gld`), `Hoorn` (`hoorn-nh`), `Beek` (`beek-lb`), and `Voorst` (`voorst-gd-voorst`) alongside the municipality slug (`beuningen`, `hoorn`, `beek`, `voorst`). Checking only `wp.slug !== municipality.slug` emitted duplicate hubs for the same town.
2. **Homonym Villages & Homonym Venues:** Sub-woonplaatsen such as `Buren` in `Ameland` (`buren-fr`) collided in `<title>` / `<meta name="description">` with municipality `Buren` (`buren`), and venues with identical names in different towns (e.g. `De Driesprong` in Zoetermeer vs. Langelille) emitted identical venue `<title>`s. Additionally, `beuningen` (`wpl-1711` in Losser) collided with municipality slug `beuningen` (`GM0209`).
3. **Multi-Checkpoint Rijkswaterstaat Beaches:** Open-water datasets assign identical place names (`Zandvoort`, `Bergen`, `Scheveningen`) to multiple beach checkpoints along the same coastline, yielding identical `<title>`s, slugs, and descriptions.

### Prevention Rule (Mandatory)
- Filter BAG seats using `isDistinctSubWoonplaats` ([`src/db/queries.ts`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/db/queries.ts)) and enforce `municipalitySlugSet` / `isCollidingMunicipalitySlug` guards so municipal slugs always take precedence.
- Generate all city, facet, and venue SEO titles/descriptions through `formatCitySeoDisplayName`, `buildCityHubTitleNl`, `buildCitySeoSummaryNl`, `buildCityIntentSeoMeta`, and `buildVenuePageSeoMeta` ([`src/domain/seo-aggregator.ts`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/domain/seo-aggregator.ts)).
- Disambiguate colliding open-water checkpoints per municipality via `disambiguateMunicipalitySpots` / `disambiguateZwemwaterName` ([`src/cli/ingest-national.ts`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/cli/ingest-national.ts)).

---

## Lesson 3: Cloudflare D1 Free Tier (`100k` Row Writes/Day) Quota Exhaustion vs. Surgical Delta Sync

### What Happened
Cloudflare D1's Free Tier enforces a hard cap of **`100,000` row writes per UTC day** (counting both table rows written and secondary index entry updates). Running full-table `INSERT OR REPLACE` via `src/cli/sync-remote-d1.ts` across all `~21,426` SQLite rows (`venues`, `basins`, `schedule_slots`, `tariffs`, `woonplaatsen`, `postcode_pc4`, etc.) triggered index re-writes on every table and consumed **`106.92k` row writes**, hitting the daily Free Tier write ceiling on a single sync!

Meanwhile, Astro 5 SSG builds (`pnpm build`) read **100% from local SQLite** (`data/allezwembaden.sqlite` via `getBuildDatabase()`) — incurring **`0` remote D1 writes**. Remote Cloudflare D1 is used solely by the edge Worker API endpoints (`/api/health.json`, `/api/leads`, `/api/clicks`).

### Prevention Rule (Mandatory)
1. **Use `--delta-venues` for Routine Venue/Deduplication Syncs:** Run `pnpm tsx src/cli/sync-remote-d1.ts --delta-venues` (or inspect `.wrangler/d1-delta-sync.sql` first with `--delta-venues --generate-only`). It queries remote D1 read-only (`0` writes), diffs against `data/allezwembaden.sqlite`, and emits only surgical `DELETE` (children $\rightarrow$ `venues`), `UPDATE venues`, and missing `INSERT OR REPLACE` statements — consuming `<1,000` row writes (`<1%` of the daily quota; `0` writes when already in sync).
2. **Never Run Full `cf:d1:sync` After Minor Data Edits:** Reserve full `sync-remote-d1.ts` runs strictly for clean schema bootstrapping or major reference-table migrations (`municipalities`, `woonplaatsen`, `postcode_pc4`), and verify with `--generate-only` first.

---

## Lesson 4: Never Ship `dist/` Without Running the 14-Invariant Post-Build Audit (`pnpm audit:seo`)

### What Happened
Unit tests on pure helpers and single-route template checks did not catch systemic static-build regressions across `4,862` generated HTML files (such as `/aanbieder` lacking JSON-LD, subtle HTML entity apostrophes in `'s-Gravendeel` breaking naive regex extractors, or unlinked intent pills).

### Prevention Rule (Mandatory)
- Always run **`pnpm build && pnpm audit:seo`** ([`src/cli/audit-dist-seo.ts`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/cli/audit-dist-seo.ts)) before `pnpm cf:deploy`.
- The audit enforces zero missing/duplicate titles & descriptions, zero missing `<h1>` / JSON-LD / `og:image`, exact canonical & `sitemap.xml` parity, zero `undefined`/`NaN`/`[object Object]` tokens, and zero broken internal links across all `4,862` HTML files.
