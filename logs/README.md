# Exposed Logs Directory (`logs/`) 📋

> **Rule ([`PHILOSOPHY.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/PHILOSOPHY.md#L59)):** *"Logging is non-negotiable. A junior dev with zero project context should be able to follow the project from logs alone."*

---

## Structure of `logs/`

* **`logs/runs/YYYY-MM-DD_sync.log`** — Human-readable step-by-step narrative log of every ingestion, scraper, and seed run.
* **`logs/runs/YYYY-MM-DD_sync.jsonl`** — Structured JSON Lines log of the exact same events (queryable via `jq` or `ripgrep`).
* **`logs/anomalies/YYYY-MM-DD_<venue-slug>.html`** — Raw HTML/PDF snapshots saved automatically whenever the **Zod Sanity Gate** quarantines a suspicious scrape so you can reproduce and fix it locally on your Mac using [`docs/runbooks/local-scraper-recovery.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/runbooks/local-scraper-recovery.md).

---

## Quick Inspection Commands

```bash
# View the latest human-readable run log
ls -t logs/runs/*.log | head -n 1 | xargs cat

# Search all quarantined anomalies across logs
rg "QUARANTINED" logs/runs/
```
