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
