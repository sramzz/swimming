# Database Script & Migration Run History (`database-context/run-history.md`)

> **Rule ([`PHILOSOPHY.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/PHILOSOPHY.md#L71)):** Every schema migration, national seed script, and manual override sync is recorded here so database state can always be reconstructed from scratch.

---

## Run Ledger

| Timestamp (UTC) | Run ID / Migration | Environment | Actor / Runner | Summary & Affected Tables | Log File Reference |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `2026-10-21T20:15:00Z` | `0000-baseline-schema-spec` | Architecture Spec | Initial Design | Defined initial SQLite/D1 schema (`schema-detailed.sql`) covering 3-entity grain (`venues`, `basins`, `venue_swim_offerings`), SCD2 `tariffs`/`schedule_periods`/`waitlist_snapshots`, Dutch calendar/KNMI tables, and quarantine observability. | N/A (Design Baseline) |
| `2026-11-09T20:30:00Z` | `0001-zwemwater-metadata-and-official-photos` | Local SQLite & D1 | Milestone 7 Recovery | Added `zwemwater_metadata_json TEXT` to `venues` (`schema-detailed.sql`), harvested all 945 official `zwemwater.nl` spot dossiers (`Informatiebord`, `Zwemwaterprofiel`, `isPaidAccess`, 4-year EU quality class, restrictions, warnings), and harvested 57 dedicated `/images/venues/official/<slug>.webp` pool photos + 16 Rijkswaterstaat open-water photos. | `logs/runs/2026-11-09_seed.log` |

---

## Standard Reconstruction Commands (Reference)

```bash
# 1. Apply schema locally to SQLite / local D1 simulator
pnpm db:migrate:local

# 2. Seed Dutch municipalities (CBS), PC4 postcodes, Feestdagen & Schoolvakanties
pnpm db:seed:nl-context

# 3. Seed Gold-Standard Randstad profiles + National Baseline (~480+ venues)
pnpm db:seed:venues

# 4. Replay or fix a single quarantined venue locally on Mac and push to D1
pnpm sync:venue --slug=<venue-slug> --push-d1
```
---

## Automated Seed & Ingestion Runs

| Run ID | Timestamp (UTC) | Runner | Job Type | Checked | Updated | Quarantined | Log File |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `2026-10-22_seed` | 2026-10-22T00:10:05.493Z | `LOCAL_MAC` | `SEED_INITIAL` | 6 | 6 | 0 | `logs/runs/2026-10-22_seed.log` |
| `2026-10-22_sync_venue` | 2026-10-22T00:17:21.705Z | `LOCAL_MAC` | `SYNC_VENUE` | 1 | 1 | 0 | `logs/runs/2026-10-22_sync_venue.log` |
| `2026-11-04_seed` | 2026-11-04T10:36:27.542Z | `LOCAL_MAC` | `SEED_INITIAL` | 6 | 6 | 0 | `logs/runs/2026-11-04_seed.log` |
| `2026-11-04_national_ingest` | 2026-11-04T10:36:32.000Z | `LOCAL_MAC` | `NATIONAL_VENUE_SCALE` | 1002 | 1002 | 0 | `logs/runs/2026-11-04_national_ingest.log` |
| `2026-11-09_seed` | 2026-11-09T19:07:11.896Z | `LOCAL_MAC` | `SEED_INITIAL` | 1002 | 1002 | 0 | `logs/runs/2026-11-09_seed.log` |
| `2026-11-09_m7_zwemwater_and_photos` | 2026-11-09T20:37:15.000Z | `LOCAL_MAC` | `ZWEMWATER_DOSSIER_AND_OFFICIAL_PHOTOS` | 1002 | 1002 | 0 | `logs/runs/2026-11-09_seed.log` |
