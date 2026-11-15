# Lessons Learned: SQLite, Cloudflare D1 & Zwemwater.nl Data Alignment

> **Rule ([`PHILOSOPHY.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/PHILOSOPHY.md#L85)):** *"Every mistake and experiment failed becomes part of a Markdown file, we have a markdown file for different types of mistakes. We pay for a lesson once!"*

---

## Lesson 1: Do Not Only Scrape the Homepage of `zwemwater.nl` — Harvest `map-content.php?spotid=<id>`

### What Happened
In `src/cli/ingest-national.ts`, we initially extracted only `data-swimming-spots` (`spotid`, `locationid`, `status`, `coordinates`, `name`) and card addresses from the main `https://www.zwemwater.nl` HTML, and assumed:
1. Every outdoor spot is free (`min_single_price_cents: 0` / `"Gratis toegang"`).
2. Outdoor spots have no official photos or information boards.
3. All warnings could be summarized with generic boilerplate text.

### What `zwemwater.nl` Actually Provides
Each spot on `zwemwater.nl` has a detail endpoint at:
`https://www.zwemwater.nl/wp-content/themes/stuurlui/blocks/map/map-content.php?spotid=<spotid>`
which returns:
- **Official Entrance Fee (`spot-entrance_fee`):** `OPENBAAR GRATIS`, `SEMI_OPENBAAR BETAALD`, `OPENBAAR BETAALD`, or `SEMI_OPENBAAR GRATIS`. Calling a paid camping or recreational lake `"Gratis toegang"` violates user trust (POLA).
- **Official Restrictions & Facilities (`spot-feature` list):** e.g., `Honden niet toegestaan`, `Zwemzone afgebakend`, `Drijflijn`, `Toezicht categorie A/B/C`, `WC / Toiletten`, `Horeca`, `Parkeerplaats`, `Invalidenparkeerplaats`, `Openbaar vervoer`, `Zandstrand`, `Speelweide`, `Zoet water` / `Zout water`.
- **Official Information Board (`Informatiebord`), Water Profile (`Zwemwaterprofiel`), and Real Spot Photos (`Foto1`, `Foto2`):** Hosted at `https://register.zwemwater.nl/zwr/api/files/<fileId>`.
- **Official 4-Year EU Water Quality Class (`spot-water_quality_last_4_year`):** `uitstekend`, `goed`, `aanvaardbaar`, `slecht`.
- **Official Bathing Season & Location Manager (`spot-location_owner_info`):** Exact season dates (`1-5 tot 30-9`) and responsible authority (Provincie / Waterschap contact details).
- **Official Active Warnings (`#panel-4 .warning-list`):** Exact warning category, start date (`vanaf DD-MM-YYYY`), and health/safety explanation.

### Prevention Rule (Mandatory)
- Always enrich `src/data/zwemwater-spots.json` and SQLite `venues` / `outdoor_conditions` with the full per-spot metadata from `map-content.php?spotid=<spotid>`.
- Never display `"Gratis toegang"` if `entrance_fee` contains `BETAALD`; set `min_single_price_cents = null` and display `"Betaald terrein / recreatiepark"` instead.
- Always surface the official `Informatiebord`, `Zwemwaterprofiel`, restrictions (`Honden niet toegestaan`, etc.), and active warning details on `/zwembad/[stad]/[slug]`.

---

## Lesson 2: Avoid Repetitive Stock Photos — Harvest Official Venue Photos First

### What Happened
Using a small pool of 32 stock photos hashed by `slug` across 4 images per category caused visible repetition on the homepage and city pages (where multiple 50m or 25m pools appear side-by-side) and showed generic photos instead of the actual pool architecture.

### Prevention Rule (Mandatory)
1. **Official Pages & Wikimedia Commons First:** For every curated/flagship pool, harvest its real photograph from its `official_website_url` (`og:image` / hero photo) or Wikimedia Commons (`commons.wikimedia.org/w/api.php`), optimize to `.webp`, and store in `public/images/venues/official/<slug>.webp`.
2. **Official `register.zwemwater.nl` Photos for Outdoor Spots:** When `map-content.php?spotid=<id>` provides `Foto1` / `Foto2` (`https://register.zwemwater.nl/zwr/api/files/...`), use the real spot photo as the primary image.
3. **Anti-Repetition Guarantee:** Enforce a unit test (`tests/domain/venue-photos.test.ts`) verifying that the top 24 venues on the homepage and within any major city have **100% distinct primary hero photos**.

---

## Lesson 3: Dutch Administrative Municipalities (*Gemeenten*) vs. Postal Towns (*Woonplaatsen*) & Internal `id` Keys

### What Happened
Initially, `venues` referenced `municipalities(slug)` (`342` CBS *gemeenten*) while storing free text in `neighborhood_name`. Because merged municipalities combine multiple distinct towns (e.g. **Abcoude**, **Vinkeveen**, **Mijdrecht** in `de-ronde-venen`; **Weesp** in `amsterdam`):
1. National ingestion (`src/cli/ingest-national.ts`) only matched place names against the 342 `municipalities.name` rows, causing Abcoude's open-water spots (`Hoge Dijk Speelsloot`, `Strand De Hoge Dijk`) to fall back to nearest centroid and land in the wrong municipality (`ouder-amstel`), while overwriting `neighborhood_name` with the municipality name.
2. Only `56` PC4 rows existed in `postcode_pc4`, leaving `findVenuesNearPostcodePc4` and the *Kortste Wachttijd Vergelijker* broken for most of the Netherlands.
3. Dutch swimmers search by *woonplaats* (`/steden/abcoude`, `/steden/weesp`), whereas school holiday regions (`noord`, `midden`, `zuid`) and municipal discount passes are governed by the parent *gemeente*.

### Prevention Rule (Mandatory)
1. **Model the 4-Tier Dutch Geography Explicitly (`Provincie` → `Gemeente` → `Woonplaats` → `PC4`):** Seed all `2,503` official Kadaster BAG *woonplaatsen* in the `woonplaatsen` table with an **immutable internal `id` (`wpl-<bag_id>`)**, `UNIQUE bag_id`, and disambiguated SEO `slug` (`valkenburg-lb` vs. `valkenburg-zh`), keeping `neighborhood_name` strictly for sub-city districts (*wijken*).
2. **Preserve Geographic Updates on Idempotent Re-Ingestion:** Ensure `ON CONFLICT(id) DO UPDATE SET` updates `municipality_slug`, `woonplaats_id`, `woonplaats_slug`, `woonplaats_name`, `postcode_pc4`, and `content_hash`, bumping `lastmod_at` **only** when `content_hash` changes.
3. **Seed `postcode_pc4` Centroids Before Foreign-Key Inserts:** Always populate `postcode_pc4` for BAG woonplaats centroids and pool addresses before inserting/updating `venues` with `PRAGMA foreign_keys = ON`.
4. **Upgrade Legacy SQLite Column Migrations Before Indexes:** When adding indexed columns (`woonplaats_id`, `woonplaats_slug`, `postcode_pc4`) to an existing SQLite file, `applyDetailedSchema` must `ALTER TABLE` missing columns **before** executing `CREATE INDEX IF NOT EXISTS`.
