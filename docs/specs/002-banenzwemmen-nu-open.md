# Spec 002 — "Waar kan ik nu banenzwemmen?" (Open Now / At Time T)

> **Status:** Agreed in grill-me session, 2026-11-14/15. Next step: plan in `docs/plans/`.
> **Problem:** Many pools are closed or offer only 1 lane for lap swimmers. Users want to find a nearby pool where they can actually swim laps *now* or at a chosen time.

## 1. Scope

| Decision | Choice |
| :--- | :--- |
| Activity | `BANENZWEMMEN` only (recreational / open water later). |
| Placement | **No new page.** Integrated into the existing homepage `SearchAndFilterIsland` as a "Wanneer?" filter. City/woonplaats `/steden/[stad]/banenzwemmen` pages link into it with `?stad=<slug>&wanneer=nu` (matching both `municipality_slug` and `woonplaats_slug`). |

## 2. Definitions

- **Open at T:** a slot qualifies if `start ≤ T` **and** `end − T ≥ 60 min`.
- **Opens soon:** slot starts within the next 60 min after T → shown in a separate "Opent binnenkort" group.
- All times are evaluated in **Europe/Amsterdam** (DST-safe).
- **Lanes:** new nullable `schedule_slots.lanes_available INTEGER`. Badge: "3 banen" / "1 baan" (orange) / "aantal banen onbekend".

## 3. UX (inside the existing filter)

- **"Wanneer?" chips:** `Altijd` (default = current behaviour) | `Nu open` | `Vanavond` (18:00) | `Morgenochtend` (07:00) | custom day (today + 6) and time (15-min steps).
- Choosing a time → auto-selects category `BANENZWEMMEN`, hides venues without a qualifying slot, and adds a slot line to the card: `Nu open · tot 10:00 · 3 banen` plus a trust badge and "Laatst gecontroleerd: <date>".
- **Location:** existing "Dichtbij mij" geolocation, with PC4/city as a fallback. Default radius 15 km (5/10/15/25/50).
- **Sort:** `Dichtstbij` (default) | `Langst open` | `Meeste banen`. **Filters modal:** min. lanes (≥2), 50m only.
- **URL state:** `?wanneer=nu` or `?wanneer=2026-11-15T18:00` (shareable).
- The map island receives the same filtered set.
- **Empty state:** "Nergens open binnen 15 km om 14:30" + the 3 nearest next opportunities + "Vergroot straal naar 25 km". Outside covered regions: "We hebben nog geen roosters voor jouw regio" + a link to the nearest covered city.

## 4. Trust rules

| State | Condition | Display |
| :--- | :--- | :--- |
| 🟢 Open | Date covered by a scraped/verified roster (`verified_at` present and ≤ 14 days old), no unverified holiday/vacation override | "Open", ranked first |
| 🟠 Waarschijnlijk open | Milestone 8 placeholder / unverified schedule (`verified_at IS NULL`), **or** holiday/vacation without a verified special roster, **or** `verified_at` > 14 days old, **or** JSON `generated_at` > 48 h old | "Waarschijnlijk open — check de website", ranked below green |
| ⛔ Excluded | `operational_state` ∈ `CLOSED_*`, `PERMANENTLY_CLOSED` | not shown |

Trust status is computed by the **existing `schedule-resolver`** at sync time, not in the browser.

## 5. Architecture (€0, abuse-proof)

- **No Worker/D1 calls at request time.** The daily sync precomputes `/data/banenzwemmen-week.json`: concrete slot occurrences for the next 8 days (`venue_id, date, start, end, lanes_available, trust, verified_at`) + `generated_at`.
- Served as a static asset (Workers static assets aren't billed; no `run_worker_first`).
- **Lazy fetch:** downloaded only when a "Wanneer?" chip is tapped or the URL has `?wanneer=`. Skeleton while loading.
- Filtering (time + distance + lanes) is a pure TS function in `src/domain/`, written test-first.
- Split per province only if the file exceeds ~300 KB gzipped.

## 6. Pipeline

`daily-sync.yml`: scrape → sanity gate (existing quarantine) → generate JSON → `pnpm build` → `cf deploy --prebuilt` → alert via `ALERT_WEBHOOK_URL` on failure. Browser-side 48 h staleness guard downgrades everything to 🟠.

## 7. Data sourcing & Milestone 8 compatibility

- Milestone 8 (`ingest-national.ts`) populates `690` pools across the Netherlands with default placeholder `schedule_periods` (`CONFIRMED_REGULAR`, `verified_at = NULL`), alongside ~27 hand-curated pools and `1` seeded `VERIFIED_PUBLISHED` pool (`venue-de-mirandabad`).
- Milestone 8 data stays untouched: unscraped placeholder schedules (`verified_at IS NULL`) are exported into `/data/banenzwemmen-week.json` as 🟠 **Waarschijnlijk open**, while Milestone B adds real per-operator/platform schedule scrapers (starting with the municipal operators of Amsterdam, Rotterdam, Utrecht, and Den Haag) that set `verified_at` and upgrade pools to 🟢 **Open**.

## 8. Sequencing & launch bar

- **Milestone A:** `lanes_available` migration, JSON generator, the "Wanneer?" filter, trust badges. TDD against the existing curated data, **behind a feature flag** (dev/preview only).
- **Milestone B:** scrapers, one operator platform at a time.
- **Public launch:** once ≥ 1 city has ≥ 80% of its pools with full scraped weekly rosters.

## 9. Out of scope (v1)

Recreational/free swimming, open water, crowdsourced corrections, real-time occupancy, a live API.
