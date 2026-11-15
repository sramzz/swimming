# Milestone 8: National Dutch Pool Completeness & BAG Woonplaats Dimension Architecture

**Status:** Complete (All 10 tasks + Milestone 8 Gate verified)
**Goal:** Eliminate missing Dutch indoor, seasonal outdoor, and subtropical swimming pools (e.g., **Het Sporthuis Abcoude** and **Victoriabad Weesp**) while modeling official Kadaster BAG **Woonplaatsen** (`2,503` postal towns/villages) with immutable internal primary keys (`id TEXT PRIMARY KEY`, `'wpl-' || bag_id`), B-tree indexes, dedicated `/steden/[stad]` and `/steden/[stad]/[intent]` SEO pages, and the full 3-entity grain (`venues`, `basins`, `venue_swim_offerings`, SCD2 `tariffs`, `schedule_periods`/`schedule_slots`).

---

## Architecture Summary

1. **Two Geographic Dimensions with Immutable Internal IDs:**
   - `municipalities` (`slug` + `id` / metadata) continues to drive holiday school-vacation regions (`noord`, `midden`, `zuid`), province hubs (`/provincies/[provincie]`), municipal canonical detail paths (`/zwembad/[municipality_slug]/[venue_slug]`), and municipal hub pages (`/steden/[municipality_slug]`).
   - `woonplaatsen` (`id TEXT PRIMARY KEY` e.g. `'wpl-1332'` for Abcoude, `'wpl-3631'` for Weesp, `'wpl-3594'` for Amsterdam; `bag_id TEXT NOT NULL UNIQUE`, `slug TEXT NOT NULL UNIQUE`, `municipality_slug`, `province_slug`, `center_lat`, `center_lng`) adds official BAG postal settlement identity and B-tree indexes across `woonplaatsen`, `postcode_pc4.woonplaats_id`, and `venues.woonplaats_id` / `venues.woonplaats_slug`.
2. **Pure Functional Resolver & National Ingestion Pipeline:**
   - `resolveDutchLocation` (`src/domain/dutch-geography.ts`) resolves `woonplaats_id`, `woonplaats_slug`, `woonplaats_name`, `municipality_slug`, and `province_slug` cleanly from curated dataset overrides, BAG lookups, and PC4/coordinate proximity.
   - `parseZwemindexProvinceHtml` & 3-entity mappers (`src/ingestion/national-pool-parser.ts`) + `harvest-national-pools.ts` (`pnpm harvest:pools`) harvest national pools with PDOK BAG postcodes (`src/data/curated-pools.json`: `690` pools) and merge idempotently via `src/cli/ingest-national.ts` with official `zwemwater.nl` open-water spots (`946` locations).
3. **Woonplaats SEO & Search Discoverability:**
   - Distinct sub-woonplaatsen (`wp.slug !== municipality.slug` with `venue_count >= 1`, e.g., `/steden/abcoude`, `/steden/weesp`, plus intent pages `/steden/[stad]/banenzwemmen`, `/zwemles`, `/buitenwater`) build as indexable static routes and appear in `/sitemap.xml` and `/steden`.
   - Homepage `rankVenuesMultiCityRecommended` and `matchesVenueSearchQuery` (`src/domain/multi-city-ranking.ts`) preserve top-24 unique official flagship photography while enabling instant search by woonplaats name, municipality name, postcode, or pool name.

---

## Completed Tasks

- [x] **Task 8.1: Schema Evolution, Internal IDs, Indexes & Migration Guards**
  - Added `woonplaatsen` table, `postcode_pc4.woonplaats_id`, `venues.woonplaats_id` / `woonplaats_slug` / `woonplaats_name`, and 7 B-tree indexes (`idx_woonplaatsen_*`, `idx_postcode_pc4_woonplaats_id`, `idx_venues_woonplaats_id`, `idx_venues_woonplaats_slug`, `idx_venues_postcode_pc4`) in `database-context/schema-detailed.sql`.
  - Added pre-index legacy `ALTER TABLE` guards in `src/db/client.ts` (`applyDetailedSchema`) and updated `database-context/SCHEMA_FOR_DUMMIES.md` and `docs/specs/001-system-and-functional-specification.md`.
  - Verified in `tests/db/client.test.ts` (`4/4` tests).

- [x] **Task 8.2: Official Kadaster BAG Woonplaatsen Harvester & Pure Geography Resolver**
  - Built `src/cli/harvest-bag-woonplaatsen.ts` generating `src/data/dutch-woonplaatsen.json` (`2,503` official Kadaster BAG woonplaatsen with unique `id`, `bag_id`, `slug`, and `primary_pc4`).
  - Implemented pure geography resolution (`resolveDutchLocation`, `slugifyNl`) in `src/domain/dutch-geography.ts` + `tests/domain/dutch-geography.test.ts` (`11/11` tests).

- [x] **Task 8.3: Database Queries & Seed Alignment**
  - Extended `src/db/queries.ts` with `MunicipalityRow`, `WoonplaatsRow`, `WoonplaatsWithCountRow`, `getMunicipalityBySlug`, `getWoonplaatsBySlug`, `listWoonplaatsenByMunicipality`, `listIndexableWoonplaatsen`, `listVenuesByWoonplaats`, and woonplaats fields on `VenueRow`.
  - Updated `src/db/seed.ts` and `tests/db/seed-and-queries.test.ts` (`4/4` tests).

- [x] **Task 8.4: Pure National Pool Parser & 3-Entity Domain Mapper**
  - Created `src/ingestion/national-pool-parser.ts` (`parseZwemindexProvinceHtml`, `classifyPoolVenueType`, `inferWaterTreatmentFromText`, `deriveBasinsFromFacilityTags`, `deriveDefaultOfferingsAndTariffs`, `cleanOfficialWebsiteUrl`) with Cheerio + Zod validation.
  - Verified in `tests/ingestion/national-pool-parser.test.ts` (`13/13` tests).

- [x] **Task 8.5: National Pool Harvester CLI (`pnpm harvest:pools`)**
  - Created `src/cli/harvest-national-pools.ts`, registered `"harvest:pools": "tsx src/cli/harvest-national-pools.ts"` in `package.json`, harvested all 12 provinces + PDOK BAG `type:adres` postcodes, and merged with preserved flagship profiles into `src/data/curated-pools.json` (`690` pools including `het-sporthuis-abcoude` at `1391 JN Abcoude` and `victoriabad-weesp` at `1383 NC Weesp`).

- [x] **Task 8.6: Idempotent 3-Entity National Ingestion & Sanity Gate**
  - Updated `src/cli/ingest-national.ts` to resolve BAG `woonplaatsen` on every venue, ensure default `basins`, `venue_swim_offerings`, SCD2 `tariffs`, and `schedule_periods`/`schedule_slots`, map `Hoge Dijk Speelsloot` & `Strand De Hoge Dijk` cleanly to `de-ronde-venen` / `wpl-1332` (`abcoude`), and enforce true-diff `lastmod_at`.
  - Logged run metrics in `database-context/run-history.md` and verified in `tests/ingestion/national-ingestion.test.ts` (`8/8` tests).

- [x] **Task 8.7: Unified Woonplaats & Gemeente SEO Pages + Sitemap**
  - Updated `src/pages/steden/[stad]/index.astro`, `src/pages/steden/[stad]/[intent].astro`, `src/domain/seo-aggregator.ts` (`matchesIntent` exported at module scope for Astro `getStaticPaths()` hoisting), and `src/pages/sitemap.xml.ts`.
  - Verified in `tests/pages/seo-build.test.ts` (`12/12` tests).

- [x] **Task 8.8: Pool Detail Breadcrumbs, JSON-LD & `/steden` Directory Upgrade**
  - Updated `src/pages/zwembad/[stad]/[slug].astro` (`getMunicipalityBySlug` dynamic vacation regions, 4-level breadcrumbs including distinct woonplaats link, `woonplaats_name` in PostalAddress JSON-LD) and `src/pages/steden/index.astro` (constituent woonplaats pills & searchable "Alle Plaatsen & Dorpen (Woonplaatsen)").
  - Verified in `tests/pages/navigation-and-links-audit.test.ts` (`9/9` tests).

- [x] **Task 8.9: Search Island, VenueCard Subtitles & Official-Photo Ranking Preserved**
  - Exported `hasOfficialVenuePhotoOnDisk` (`src/domain/venue-photos.ts`), updated `rankVenuesMultiCityRecommended`, `matchesVenueSearchQuery`, and `rankVenuesForSearch` (`src/domain/multi-city-ranking.ts`) to prioritize official-photo flagships while matching woonplaatsen/postcodes/pools, and updated `src/components/islands/SearchAndFilterIsland.tsx` & `src/components/VenueCard.astro`.
  - Verified in `tests/domain/multi-city-ranking.test.ts` (`5/5` tests) and `tests/domain/venue-photos.test.ts` (`4/4` tests).

- [x] **Task 8.10: Milestone 8 Documentation & Lessons Learned**
  - Recorded Lesson 3 (*Dutch Administrative Municipalities (Gemeenten) vs. Postal Towns (Woonplaatsen) & Internal id Keys*) in `docs/lessons/sqlite-d1-and-data.md`.
  - Added this milestone specification and registered Milestone 8 in `docs/plans/000-master-implementation-plan.md`.

---

## Verified Milestone 8 Gate Results

- **Database Coverage (`data/allezwembaden.sqlite`):**
  - `2,503` official Kadaster BAG `woonplaatsen` (`wpl-*`)
  - `2,704` `postcode_pc4` centroids
  - `1,641` active `venues` (`946` `OPEN_WATER_NATURAL`, `280` `INDOOR_ONLY`, `231` `OUTDOOR_SEASONAL_POOL`, `106` `INDOOR_AND_OUTDOOR`, `77` `SUBTROPICAL_PARADISE`, `1` `BOUTIQUE_SWIM_SCHOOL_POOL`) across `333` municipalities and `894` distinct `woonplaatsen` (`0` venues without `woonplaats_id`)
  - `het-sporthuis-abcoude` (`wpl-1332` `abcoude`, `de-ronde-venen`, `1391 JN`) & `victoriabad-weesp` (`wpl-3631` `weesp`, `amsterdam`, `1383 NC`) present in DB, `/sitemap.xml`, `/steden/abcoude`, `/steden/weesp`, and detail routes.
- **Build & Automated Checks:**
  - `pnpm lint` (`oxlint --deny-warnings src tests`): 0 warnings, 0 errors across 63 files
  - `pnpm typecheck` (`astro check`): 0 errors, 0 warnings, 0 hints across 79 files
  - `pnpm test` (`vitest run`): 25 test files, 124 tests passed
  - `pnpm build` (`astro build && tsx src/cli/prepare-cf-output.ts`): `4991` static pages + Cloudflare Worker output generated cleanly
