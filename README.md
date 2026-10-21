# AlleZwembaden.nl 🏊‍♂️🇳🇱

> **The Netherlands' fastest, most transparent directory for swimming pools, lane-swimming (*banenzwemmen*) schedules, *Zwem-ABC* lesson waitlists, and open-water conditions.**

---

## What is this project? (2-Minute Overview)

**AlleZwembaden.nl** is a read-heavy, SEO-first Dutch aggregator and lead-generation platform built to solve four everyday problems for swimmers and parents in the Netherlands:

1. **Directory, Water Treatment & Pricing Clarity:** Find indoor/outdoor pools (*binnenbaden*, *subtropische zwembaden*, *50m wedstrijdbaden*), compare admission tariffs (*losse entree*, *10-badenkaart*, *maandabonnement*, municipal discount passes like *Stadspas*), and filter by skin-friendly **water disinfection** (`Zoutelektrolyse` vs. `Klassiek Chloor`).
2. **Reliable *Banenzwemmen* & Holiday Schedules:** Know when lanes are actually open today—with automatic awareness of **Dutch public holidays (*Feestdagen*)**, regional **school vacations (*Schoolvakanties Regio Noord, Midden, Zuid*)**, and **KNMI weather warnings (*Code Oranje / Rood*)**.
3. **Kids' Swim Lessons (*Zwem-ABC* Waitlist Comparison & Lead Gen):** Compare *Diploma A/B/C* waitlists (*wachttijden*), NRZ accreditation, and monthly lesson packages across municipal pools and commercial swim schools—capturing high-intent parent demand via our *"Kortste Wachttijd Vergelijker & Alert"*.
4. **Open Water & Seasonal Transitions:** Track live outdoor water temperatures (`Rijkswaterstaat` / `Zwemwater.nl`), *blauwalg* warnings, and cold-water wetsuit advisories (with a security-hardened stub for contextual affiliate gear).

---

## Architecture at a Glance (€0 Surprise-Bill & 100/100 SEO)

| Layer | Technology | Why |
| :--- | :--- | :--- |
| **Hosting & CDN** | **Cloudflare Pages + Workers (Free Tier)** | Unlimited free static requests, `<15ms` TTFB from Amsterdam (`AMS`), hard caps (impossible to get a runaway DDoS bill). |
| **Frontend & SEO** | **Astro 5 (TypeScript) + Tailwind CSS v4** | `0 KB` JS by default on SEO landing pages; isolated **Preact (3 KB) + TypeScript FSM** islands only for interactive search, maps, and forms. |
| **Database** | **Cloudflare D1 (SQLite)** | Serverless SQLite at the edge with 30-day Time Travel recovery, SCD Type 2 history, and bounding-box/Haversine geo queries (`<1ms`). |
| **Maps (€0 Cost)** | **Google Maps Lazy `<iframe>`** (Detail) + **MapLibre GL + OpenFreeMap/PDOK** (Search) | Zero API keys or credit cards required; interactive Airbnb-style price/waitlist pills on search pages. |
| **Scraping & Sync** | **Portable TypeScript CLI (`pnpm sync`)** + **Lightpanda / Obscura (CDP)** | `fetch`-first (`~50 MB` RAM), escalating to **Lightpanda/Obscura** (`~25–30 MB` RAM via CDP) for JS widgets, guarded by a **Zod Sanity Gate** + **Local Mac Fallback**. |
| **Observability** | **Exposed [`logs/`](file:///Users/sramzzs4d/Projects-sramzz/swimming/logs) + Webhook Push + `/api/health`** | Human-readable `.log` + `.jsonl` files, instant Telegram/Discord/Slack/ntfy anomaly alerts, and Uptime Kuma monitoring. |

---

## Where to Start Reading

* 🚀 **Ready to Start Coding? (Junior Devs Start Here):** Open **[`docs/plans/000-master-implementation-plan.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/plans/000-master-implementation-plan.md)** and begin at **[Milestone 1, Task 1.1 (`docs/plans/milestone-1-foundation-and-db.md`)](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/plans/milestone-1-foundation-and-db.md)**.
* 📘 **New here?** Read **[`docs/PROJECT_FOR_DUMMIES.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/PROJECT_FOR_DUMMIES.md)** for a plain-English tour of how everything connects.
* 🧭 **Engineering Principles:** Read **[`PHILOSOPHY.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/PHILOSOPHY.md)** (Full Path: TDD, Finite State Machines, CQS, Idempotency, SCD discipline).
* 🗺️ **Vision & Roadmap:** Read **[`docs/steering/roadmap-vision.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/steering/roadmap-vision.md)**.
* 🗄️ **Database & Grain:** Start with **[`database-context/SCHEMA_FOR_DUMMIES.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/database-context/SCHEMA_FOR_DUMMIES.md)**, then inspect **[`database-context/schema-detailed.sql`](file:///Users/sramzzs4d/Projects-sramzz/swimming/database-context/schema-detailed.sql)**.
* 📐 **Full System Specification:** Read **[`docs/specs/001-system-and-functional-specification.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/specs/001-system-and-functional-specification.md)**.
* 🏛️ **Architecture Decisions (MADRs):** Browse **[`docs/MADRs/`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/MADRs/)**.
* 🛠️ **Operational & Setup Runbooks:**
  * **[`docs/runbooks/000-preflight-accounts-and-cf-cli.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/runbooks/000-preflight-accounts-and-cf-cli.md)** *(Cloudflare `cf` CLI, GitHub, `.env`, & Account Setup)*
  * **[`docs/runbooks/local-scraper-recovery.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/runbooks/local-scraper-recovery.md)** *(1-Line Mac Fallback when a pool scraper breaks)*
* 🎨 **UI Mockups & Design System:** Explore **[`DesignMockups/`](file:///Users/sramzzs4d/Projects-sramzz/swimming/DesignMockups/)**.

---

## 👨‍💻 Junior Developer 15-Minute Onboarding Checklist

If you just joined the team and want to know **what to read, what accounts/tools you need, and where to write your first line of code**, follow these 5 steps in exact order:

1. **Pre-Flight Setup & Cloudflare `cf` CLI (3 mins):** Read **[`docs/runbooks/000-preflight-accounts-and-cf-cli.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/runbooks/000-preflight-accounts-and-cf-cli.md)** to verify Node `>= 22.18.0`, install the new Cloudflare **`cf` CLI** (`pnpm add -g cf`), and copy `.env.example` $\rightarrow$ `.env`.
2. **Understand the Product (4 mins):** Read **[`docs/PROJECT_FOR_DUMMIES.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/PROJECT_FOR_DUMMIES.md)** and open the HTML mockups in **[`DesignMockups/`](file:///Users/sramzzs4d/Projects-sramzz/swimming/DesignMockups/)** in your browser so you can see the target UI.
3. **Understand the Database (4 mins):** Read **[`database-context/SCHEMA_FOR_DUMMIES.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/database-context/SCHEMA_FOR_DUMMIES.md)** to learn the difference between a **Venue** (building), a **Basin** (water tank), and a **Swim Offering** (*Zwem-ABC* lesson program).
4. **Understand the Checkbox Definition of Done (4 mins):** Read **[The Checkbox Contract (`✅ DoD`) in `docs/plans/000-master-implementation-plan.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/plans/000-master-implementation-plan.md#L76-L103)**—never tick a `[x]` box until the failing test was seen, the passing test ran, and the commit is clean.
5. **Start Coding:** Open **[`docs/plans/milestone-1-foundation-and-db.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/plans/milestone-1-foundation-and-db.md)** at **Task 1.1, Step 1**. Every file path, code snippet, test case, `✅ DoD` box, and terminal command is written out step-by-step.
