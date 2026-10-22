# Database Script & Migration Run History (`database-context/run-history.md`)

> **Rule ([`PHILOSOPHY.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/PHILOSOPHY.md#L71)):** Every schema migration, national seed script, and manual override sync is recorded here so database state can always be reconstructed from scratch.

---

## Run Ledger

| Timestamp (UTC) | Run ID / Migration | Environment | Actor / Runner | Summary & Affected Tables | Log File Reference |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `2026-10-21T20:15:00Z` | `0000-baseline-schema-spec` | Architecture Spec | Initial Design | Defined initial SQLite/D1 schema (`schema-detailed.sql`) covering 3-entity grain (`venues`, `basins`, `venue_swim_offerings`), SCD2 `tariffs`/`schedule_periods`/`waitlist_snapshots`, Dutch calendar/KNMI tables, and quarantine observability. | N/A (Design Baseline) |

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
