# MADR 0001: Hosting on Cloudflare Pages (SSG-First) with Cloudflare D1 (SQLite)

* **Status:** Accepted
* **Date:** 2026-10-21
* **Deciders:** Engineering / Architecture Consultative Review (Pragmatic, Conservative, Principles-Driven, New Tech Adopter)

---

## Context and Problem Statement

AlleZwembaden.nl is a read-heavy Dutch swimming directory (~480–1,800 locations across pools, swim schools, and open-water spots) that must:
1. Excel at **Google SEO** (instant `<20ms` TTFB in the Netherlands, 100/100 Core Web Vitals).
2. Be **100% protected against surprise runaway bills** during traffic bursts or DDoS attacks.
3. Fit comfortably within either **Cloudflare Free Tier** or an existing **Hetzner VPS with 2GB RAM running Coolify**.
4. Support relational + geospatial queries (*"pools within 10 km of postcode 1012AB"*) and Slowly Changing Dimensions (SCD Type 2) for tariffs, seasonal schedules, and waitlists.

---

## Decision Drivers

* **Zero Runaway Billing Risk:** A DDoS attack or viral traffic spike must never result in a surprise invoice.
* **KISS & Right-Sized Effort ([`PHILOSOPHY.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/PHILOSOPHY.md)):** Avoid using a chainsaw (heavy database servers requiring RAM tuning and manual upgrades) to slice a piece of cake (~1,800 Dutch locations = `<50 MB` of relational data).
* **2GB RAM Protection on Hetzner:** Self-hosting PostgreSQL + PostGIS + Node SSR inside Coolify on a 2GB RAM machine risks Linux OOM kills during builds or traffic bursts.
* **Data Ownership & Portability:** Standard SQL schema that can be exported or run locally as a plain SQLite file at any time.

---

## Considered Options

1. **Cloudflare Pages (Static SSG First) + Cloudflare D1 (SQLite at the Edge) + Edge-Cached Workers** *(Selected)*
2. **Hetzner 2GB Coolify + PostgreSQL 16 / PostGIS in Docker**
3. **Cloudflare Pages + Turso (Managed libSQL)**
4. **Hetzner 2GB Coolify + Plain Local SQLite (WAL mode) behind Cloudflare CDN**

---

## Decision Outcome

Chosen option: **Option 1 — Cloudflare Pages (SSG-First) + Cloudflare D1 (SQLite)**, with the Hetzner 2GB Coolify server reserved strictly for optional background jobs / Uptime Kuma monitoring.

### Why Cloudflare D1 (SQLite) over PostgreSQL/PostGIS:
* **Dataset Scale:** The entire Netherlands has ~1,000 pools, ~800 official open-water spots, and ~4,000 4-digit postcodes (PC4). A SQLite bounding-box index (`WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`) + Haversine distance formula resolves radius queries over 1,800 rows in **`< 0.5 ms`** without consuming 300–400 MB of idle RAM for PostGIS.
* **Built-in Backups:** D1 includes 30-day point-in-time Time Travel recovery and 1-command `.sql` dumps (`wrangler d1 export`).

### How DDoS & Billing Immunity is Guaranteed:
1. **Hard Caps on Free Tier:** Cloudflare Free Tier does not charge pay-as-you-go overages.
2. **Unlimited Free Static Bandwidth:** 99% of user and Googlebot page views hit pre-rendered static HTML on Cloudflare Pages (unlimited free requests).
3. **CDN Shield in Front of D1 Reads:** Any dynamic JSON/Server Island endpoint (e.g., outdoor water temperatures) sets `Cache-Control: public, s-maxage=1800, stale-while-revalidate=86400`, ensuring D1 is queried at most once per 30 minutes per resource regardless of traffic volume.
4. **WAF + Turnstile in Front of D1 Writes:** Lead-capture endpoints (`POST /api/leads`) are protected by Cloudflare WAF Rate Limiting and Cloudflare Turnstile before executing Worker/D1 writes.
