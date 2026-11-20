# Technical Specification: Programmatic SEO at Scale & Post-Build Quality Gate (`003`)

* **Version:** 1.0 (Milestone 9 Scale SEO Baseline)
* **Date:** 2026-11-20
* **Status:** Active / Implemented
* **Parent Spec:** [`docs/specs/001-system-and-functional-specification.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/specs/001-system-and-functional-specification.md)
* **Verification Gate:** `pnpm audit:seo` ([`src/cli/audit-dist-seo.ts`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/cli/audit-dist-seo.ts))

---

## 1. Indexable URL Taxonomy (`4,861` Pages)

All indexable routes are statically pre-rendered by Astro 5 into `dist/` and listed with 1:1 parity in `/sitemap.xml` ([`src/pages/sitemap.xml.ts`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/pages/sitemap.xml.ts)). Canonical URLs always use `https://zwemkaart.nl` with no trailing slash (except `/`), enforced at the edge via `runWorkerFirst` single-hop 301 redirects in [`src/worker.ts`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/worker.ts).

| Route Pattern | Source Template | Indexable Count | Primary JSON-LD Schema(s) |
| :--- | :--- | :---: | :--- |
| `/` | [`src/pages/index.astro`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/pages/index.astro) | `1` | `WebSite` (`SearchAction`), `ItemList` |
| `/steden` | [`src/pages/steden/index.astro`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/pages/steden/index.astro) | `1` | `BreadcrumbList`, `CollectionPage` |
| `/aanbieder` | [`src/pages/aanbieder.astro`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/pages/aanbieder.astro) | `1` | `BreadcrumbList`, `WebPage` |
| `/provincies/[provincie]` | [`src/pages/provincies/[provincie].astro`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/pages/provincies/[provincie].astro) | `12` | `BreadcrumbList`, `ItemList` |
| `/steden/[stad]` (Municipalities) | [`src/pages/steden/[stad]/index.astro`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/pages/steden/[stad]/index.astro) | `332` | `BreadcrumbList`, `ItemList` |
| `/steden/[stad]` (Distinct Sub-Woonplaatsen) | [`src/pages/steden/[stad]/index.astro`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/pages/steden/[stad]/index.astro) | `656` | `BreadcrumbList`, `ItemList` |
| `/steden/[stad]/[intent]` (`banenzwemmen`, `zwemles`, `buitenwater`) | [`src/pages/steden/[stad]/[intent].astro`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/pages/steden/[stad]/[intent].astro) | `2,241` | `BreadcrumbList`, `ItemList` |
| `/zwembad/[stad]/[slug]` | [`src/pages/zwembad/[stad]/[slug].astro`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/pages/zwembad/[stad]/[slug].astro) | `1,617` | `PublicSwimmingPool`, `BreadcrumbList` |
| **Total Indexable Pages (`sitemap.xml`)** | | **`4,861`** | **100% Valid JSON-LD** |
| `/404` *(Non-indexable error page)* | [`src/pages/404.astro`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/pages/404.astro) | `1` (`noindex, follow`) | Excluded from `sitemap.xml` (`4,862` total HTML files) |

---

## 2. Physical Pool & Geographic Deduplication

### 2.1 Physical Pool Deduplication (`1,641` $\rightarrow$ `1,617` Venues)
To prevent duplicate listings when merging hand-curated `GOLD_STANDARD_SEEDS` with Zwemindex province harvests (`src/cli/harvest-national-pools.ts`), physical uniqueness is enforced by pure helpers (`isPhysicalDuplicate`, `deduplicatePhysicalPools`, `normalizeStreetAndNumber`, `hasMeaningfulTokenOverlap`):
1. **Exact Normalized Slug Match:** Matching `slugifyNl(slug)`.
2. **Street + House Number Proximity Match:** Identical normalized street and house number within `<= 2,000 m` or matching `postcode_pc4`.
3. **Tight Coordinate + Brand Token Overlap:** Within `<= 120 m` Haversine distance when non-generic pool name tokens overlap meaningfully (excluding generic terms such as `zwembad`, `bad`, `sportcomplex`, `recreatiebad`).

### 2.2 Eponymous Municipality Seat Suppression (`isDistinctSubWoonplaats`)
Kadaster BAG *woonplaatsen* often include an eponymous town seat whose slug carries a province or municipality suffix (e.g., `hoorn-nh` inside municipality `hoorn`, `beuningen-gld` (`Beuningen Gld`) inside `beuningen`, `voorst-gd-voorst` inside `voorst`, `beek-lb` inside `beek`). Emitting separate `/steden/[stad]` hubs for these creates near-duplicate municipality pages.

`isDistinctSubWoonplaats` in [`src/db/queries.ts`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/db/queries.ts) returns `false` whenever:
* Required name/slug inputs are missing.
* `woonplaats_slug === municipality_slug` or `woonplaats_name === municipality_name` (case-insensitive).
* Stripping trailing Dutch province codes (`gld|nh|zh|nb|lb|fr|ov|dr|ut|zl|fl|gr|gd`) from `woonplaats_name` equals `municipality_name`.
* Stripping trailing province (and optional municipality) slug suffixes (`-(gld|nh|zh|nb|lb|fr|ov|dr|ut|zl|fl|gr|gd)(-[a-z0-9-]+)?$`) from `woonplaats_slug` equals `municipality_slug`.

**Municipality Slug Collision Guard:**
* Genuine distinct sub-woonplaatsen number `657` with `>= 1` venue, of which `1` (`beuningen`, BAG `wpl-1711` in Overijssel municipality `losser`) shares a slug with municipality `beuningen` (`GM0209`, Gelderland).
* `getStaticPaths()` in `[stad]/index.astro`, `[stad]/[intent].astro`, `/steden`, and `sitemap.xml.ts` give municipalities strict precedence (`656` non-colliding sub-woonplaats hubs), while `[stad]/[slug].astro` uses `isCollidingMunicipalitySlug` so breadcrumb links never point to the wrong municipality.
* `resolveLocationBySlug` maps province-suffixed eponymous slugs (e.g. `hoorn-nh`) back to their parent `municipality` resolution cleanly.

---

## 3. Unique `<title>` & `<meta name="description">` Formulas

All programmatic titles and meta descriptions are generated deterministically by pure domain functions in [`src/domain/seo-aggregator.ts`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/domain/seo-aggregator.ts):

1. **Disambiguated Place Display Name (`formatCitySeoDisplayName`):**
   * Returns `${cityName} (${municipalityName})` when `isWoonplaats === true` and `municipalityName` differs from `cityName` (e.g. `Buren (Ameland)` vs municipality `Buren`; `Aalst (Zaltbommel)`).
2. **City / Woonplaats Hub Pages (`buildCityHubTitleNl` & `buildCitySeoSummaryNl`):**
   * `<title>`: `Zwembaden in ${displayName} - Prijzen, Banenzwemmen & Zwemles | Zwemkaart.nl`
   * `<meta name="description">`: Deterministic summary combining `totalVenues`, `Zoutelektrolyse` count, cheapest `SINGLE_ADULT` price (`formatEuroCentsNl`), and shortest `Zwemdiploma A` waitlist (`buildCitySeoSummaryNl`).
3. **City Intent Facet Pages (`buildCityIntentSeoMeta`):**
   * Keeps `<h1>` readable (`Banenzwemmen in ${cityName}`), while embedding `displayName` and `venueCount` in both `<title>` and `<meta name="description">` for 100% uniqueness across homonym villages.
4. **Venue Detail Pages (`buildVenuePageSeoMeta`):**
   * Qualifies venue name with `(${woonplaats_name || municipalityName})` when the venue name does not already contain the place/municipality name — eliminating duplicates across homonym pools like `De Driesprong (Zoetermeer)` vs `De Driesprong (Langelille)`.
   * Differentiates copy between `OPEN_WATER_NATURAL` (`Zwemwaterkwaliteit, Blauwalg & Voorzieningen`) and pools (`Prijzen, Banenzwemmen & Zwemles`), and appends `street_address` + `placeInText` (`<Woonplaats> (Gemeente <Gemeente>)` when distinct).
5. **Rijkswaterstaat Beach Checkpoint Disambiguation (`disambiguateZwemwaterName` & `disambiguateMunicipalitySpots`):**
   * Defined in [`src/cli/ingest-national.ts`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/cli/ingest-national.ts) (`cleanVenueName` normalizes `'t` / `'s-` apostrophes).
   * When multiple open-water spots share a name inside a municipality (e.g. `Zandvoort`, `Bergen`), disambiguates with street prefix (`Bergen (Parkweg)`) or `${cleanName} (${streetPrefix} - ${spotid})` / `${cleanName} (${spotid})` when street prefixes collide (`Zandvoort (Boulevard Barnaart - 39020)`).

---

## 4. Zero-404 Facet Pill Linking (`getAvailableCityIntents`)

* [`src/domain/seo-aggregator.ts`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/domain/seo-aggregator.ts) exports `matchesIntent`, `shouldGenerateIndexableFacetPage(count >= 1)`, and `getAvailableCityIntents(venues)`.
* `banenzwemmen` and `zwemles` match non-`OPEN_WATER_NATURAL` venues; `buitenwater` matches `OPEN_WATER_NATURAL`, `INDOOR_AND_OUTDOOR`, and `OUTDOOR_SEASONAL_POOL`.
* Both `[stad]/index.astro` and `[stad]/[intent].astro` render `<a href="/steden/[stad]/[intent]">` pills **only** for intents returned by `getAvailableCityIntents(venues)` — guaranteeing 100% parity between rendered internal links and generated facet pages.

---

## 5. 100% JSON-LD Structured Data Coverage

Every indexable page emits valid JSON-LD via [`src/layouts/BaseLayout.astro`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/layouts/BaseLayout.astro):
* **Homepage (`/`):** `WebSite` (with `SearchAction` `?q={search_term_string}`) + `ItemList` of top 24 multi-city ranked venues.
* **Directory (`/steden`):** `BreadcrumbList` + `CollectionPage`.
* **Partner Portal (`/aanbieder`):** `BreadcrumbList` + `WebPage`.
* **Province / City / Intent Hubs:** `BreadcrumbList` (3 levels for sub-woonplaats hubs, 4 levels for sub-woonplaats intents) + `ItemList` (`buildItemListJsonLd`).
* **Venue Detail (`/zwembad/[stad]/[slug]`):** `PublicSwimmingPool` (`buildVenueJsonLd`: `PostalAddress`, `GeoCoordinates`, `LocationFeatureSpecification`, optional `AggregateRating`, `Offer`, `image`, `sameAs`, `isAccessibleForFree`) + `BreadcrumbList`.

---

## 6. Post-Build 14-Invariant Audit Gate (`pnpm audit:seo`)

[`src/cli/audit-dist-seo.ts`](file:///Users/sramzzs4d/Projects-sramzz/swimming/src/cli/audit-dist-seo.ts) (`auditDistDirectory` + `hasAuditFailures`) scans the entire compiled `dist/` tree and `dist/sitemap.xml` before Cloudflare deployment and fails (`exit 1`) on any violation of 14 invariants:

1. **Minimum Indexable Page Floor:** `totalIndexablePages >= 4,800`.
2. **Missing `<title>`:** `0` indexable pages without non-empty `<title>`.
3. **Duplicate `<title>`:** `0` duplicate titles across all indexable pages.
4. **Missing `<meta name="description">`:** `0` indexable pages without non-empty meta description.
5. **Duplicate `<meta name="description">`:** `0` duplicate descriptions across all indexable pages.
6. **Missing `<h1>`:** `0` indexable pages without non-empty `<h1>`.
7. **Canonical Mismatch:** Every indexable page's `<link rel="canonical">` equals exact `https://zwemkaart.nl${route}`.
8. **Sitemap Missing in `dist/`:** Every `<loc>` in `sitemap.xml` maps to a built HTML page in `dist/`.
9. **`dist/` Missing in Sitemap:** Every indexable HTML page in `dist/` appears in `sitemap.xml`.
10. **Missing JSON-LD:** Every indexable page includes `>= 1` `<script type="application/ld+json">` block.
11. **Invalid JSON-LD:** Every JSON-LD block parses cleanly with `JSON.parse()`.
12. **Missing `og:image`:** Every indexable page defines `<meta property="og:image">`.
13. **Broken `og:image` Asset:** Every local `og:image` path resolves to an existing static file in `dist/`.
14. **Bad Text Tokens & Broken Internal Links:** Zero `undefined`, `NaN`, or `[object Object]` strings in title, description, `<h1>`, or visible body text; zero broken internal `<a href="...">` targets across all `4,862` HTML files (including `404.html`).
