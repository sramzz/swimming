# MADR 0004: Portable TypeScript Ingestion CLI, Lightpanda/Obscura CDP Escalation, Quarantine Gate & Webhook Alerting

* **Status:** Accepted
* **Date:** 2026-10-21
* **Deciders:** Engineering / Data Engineering & Observability Review

---

## Context and Problem Statement

AlleZwembaden.nl aggregates schedules, admission tariffs, water treatment specs (*Zoutelektrolyse* vs. *Chloor*), and *Zwem-ABC* waitlists from ~480+ Dutch pools, alongside official Dutch open APIs (*Rijkswaterstaat/Zwemwater.nl*, *KNMI*, *Rijksoverheid Schoolvakanties*).
Key constraints:
1. **Memory Limit:** Traditional Headless Chromium (`Playwright` / `Puppeteer`) consumes **400–800 MB of RAM**, which threatens a 2GB RAM VPS.
2. **Website Redesigns & Bot Blocks:** Pool websites occasionally change HTML structure, publish holiday rosters as PDFs, or block datacenter IPs (`HTTP 403`). A broken scrape must **never** overwrite valid production prices or timetables in Cloudflare D1.
3. **Observability ([`PHILOSOPHY.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/PHILOSOPHY.md#L59)):** Logs must be readable by a junior developer from an exposed `logs/` folder without heavy log-aggregation daemons (like Grafana Loki) eating 500 MB of RAM, while still alerting the operator immediately when anomalies occur.

---

## Decision Drivers

* **Single Language & Zero Schema Drift across Web, Workers & Scraper**
* **Ultra-Low Memory Footprint (`< 80 MB` total RAM during scraping)**
* **Idempotency & Safe Quarantine of Anomalous Scrapes**
* **Seamless Local Mac Fallback (`pnpm sync:venue --slug=...`)**
* **Zero-Cost Push Alerting with Deduplication Cooldown**

---

## Considered Options

### CLI Language:
* **TypeScript (`Bun`/`Node` + `fetch` + `cheerio` + `unpdf` + `Zod`)** *(Selected — 100% shared schema/FSM types with Astro & Cloudflare Workers, ~50 MB RAM)*
* **Python (`uv` + `httpx` + `pdfplumber` + `Pydantic`)** *(Runner-up; avoided splitting repo into two languages since `unpdf`/`mupdf-wasm` covers PDF extraction in TS)*
* **Go / Rust CLI** *(Rejected for DOM/PDF scraping maintenance velocity per KISS)*

### Headless Browser for JS-Rendered Pool Widgets:
* **3-Step Escalation Ladder: Plain `fetch` $\rightarrow$ `Lightpanda` (Zig, ~24 MB RAM) or `Obscura` (Rust, ~30 MB RAM) over CDP $\rightarrow$ Local Mac Fallback** *(Selected)*
* **Headless Chromium Everywhere** *(Rejected — 400–800 MB RAM bloat)*
* **Ladybird Browser** *(Rejected — consumer desktop browser with `LibGfx`, lacks mature CDP scraping ecosystem)*

### Observability & Monitoring:
* **Dual Human `.log` + `.jsonl` in `logs/` + D1 `ingestion_runs` + Instant Webhook Push + `/api/health` (Uptime Kuma)** *(Selected)*
* **Grafana + Loki + Promtail** *(Rejected — consumes 350–600 MB RAM and adds unnecessary operational complexity)*

---

## Decision Outcome

### 1. The 3-Step Scraping Escalation Ladder (`~50–80 MB` RAM)
1. **Step 1 — Direct `fetch()` + `cheerio` (HTML) / JSON API / `unpdf` (PDF):** Handles ~85–90% of Dutch pools and 100% of official open APIs (*Rijkswaterstaat*, *KNMI*, *Rijksoverheid*) with zero browser overhead. Runs natively on **Cloudflare Cron Workers**, **GitHub Actions**, **Coolify Docker**, and **Local Mac**.
2. **Step 2 — `Lightpanda` or `Obscura` via CDP (`playwright-core` `connectOverCDP`):** Handles the ~10–15% of pools with JS-hydrated timetable widgets (*Recreatex*, etc.) in **~24–30 MB RAM**. Both engines will be benchmarked during POC (Step 1 of `PHILOSOPHY.md`) via a single `CDP_ENDPOINT` environment variable. Runs natively on **GitHub Actions**, **Coolify Docker**, and **Local Mac**.
3. **Step 3 — Local Mac Replay & Manual Override:** When a cloud scrape is blocked by a datacenter IP (`HTTP 403`) or encounters a complex layout change, running `pnpm sync:venue --slug=<slug> --push-d1` on the developer's Mac executes from a residential IP or reads `database-context/manual-overrides/<slug>.json`.

### 2. Idempotency & The Zod Sanity Gate (Quarantine FSM)
* Every fetch computes `sha256(raw_body)`. If unchanged since the last verified run, the scraper exits as an idempotent no-op.
* Extracted data must pass **Zod Schema + Domain Sanity Rules** (e.g., adult single ticket between `€1.50` and `€35.00`; non-empty schedule slots for active pools).
* If validation fails, live D1 data is **untouched**, raw HTML/PDF is saved to `logs/anomalies/`, and the run status transitions to `QUARANTINED_ANOMALY`.

### 3. Webhook Push Alerting with 24h Cooldown
* Any `QUARANTINED_ANOMALY` or API sync failure dispatches a JSON payload to `ALERT_WEBHOOK_URL` (supporting Telegram, Discord, Slack, or ntfy.sh) containing the anomaly reason and the exact copy-paste Mac recovery command.
* An alert state machine suppresses duplicate alerts for the same `(venue_slug, error_code)` for 24 hours until resolved.
