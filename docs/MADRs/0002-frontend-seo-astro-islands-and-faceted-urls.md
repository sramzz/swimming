# MADR 0002: Astro 5 Zero-JS Default, Isolated FSM Islands & Two-Tier Faceted SEO

* **Status:** Accepted
* **Date:** 2026-10-21
* **Deciders:** Engineering / SEO Consultative Review

---

## Context and Problem Statement

Directory websites win or lose organic search traffic based on two technical frontend factors:
1. **Wave-1 Crawlability & Core Web Vitals (LCP, INP, CLS):** Full-page JavaScript hydration blocks the main thread on mobile devices and delays Googlebot indexing of large timetable/pricing DOM trees.
2. **Faceted Navigation Strategy:** Making search intents (*Banenzwemmen*, *Zwemles A/B/C*, *Buitenwater*) client-only checkboxes prevents Google from ranking dedicated city intent pages, whereas indexing every query-parameter filter combination causes catastrophic crawl-budget exhaustion and thin-content penalties.

---

## Decision Drivers

* **100/100 Mobile Core Web Vitals (LCP & INP)**
* **Maximum Programmatic SEO Coverage without Index Bloat / Soft-404s**
* **Strict Finite State Machine (FSM) Discipline ([`PHILOSOPHY.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/PHILOSOPHY.md#L49))**
* **Cloudflare Pages Build Budget (500 free builds/month)**

---

## Considered Options

1. **Astro 5 (TypeScript) + Tailwind CSS v4 + Isolated Preact (3 KB) / TS FSM Islands + Speculation Rules + Two-Tier Facet Routing** *(Selected)*
2. **Full-Page Hydrated SSR/SPA Framework (Next.js / SvelteKit with global CSR)**
3. **Pure Server HTML + HTMX (No static build pre-rendering)**

---

## Decision Outcome

Chosen option: **Option 1 — Astro 5 with Zero-JS Default, Isolated Islands, and Two-Tier Faceted URL Architecture**.

### 1. HTML Delivery & Hydration Rules (`3A`)
* **0 KB JS Default:** All structural content, breadcrumbs, facility cards, pricing tables, weekly timetables, and `<script type="application/ld+json">` schemas (`SportsActivityLocation`, `Course`, `AggregateOffer`, `FAQPage`, `BreadcrumbList`) compile to pure static HTML.
* **Isolated Islands Only Where State Exists:** Tiny Preact (3 KB) + framework-agnostic TypeScript Finite State Machines (`src/machines/`) are mounted **only** for:
  1. The 3-segment Search Pill & Micro-Filter bar
  2. The Interactive Listing Split-View Map (`client:visible` / `client:idle`)
  3. The Sticky Price Calculator & *Zwem-ABC* Waitlist/Alert Lead Form
* **Instant Page Transitions:** Browser `<script type="speculationrules">` prerenders/prefetches facility detail pages on hover/pointerdown.

### 2. Two-Tier URL Taxonomy & Soft-404 Quality Gate (`3B`)
* **Shallow Canonical Entity URLs:** `/zwembad/[stad]/[slug]` (e.g., `/zwembad/amsterdam/de-mirandabad`). Hierarchy is expressed via breadcrumbs and `BreadcrumbList` JSON-LD so entity URLs never break if categories change.
* **Tier-1 Indexable Static Intent Pages (Pre-rendered):**
  * `/steden/[stad]` (All locations in city + auto-generated data summary)
  * `/steden/[stad]/banenzwemmen` (Consolidated lane-swimming timetable & *10-badenkaart* comparison)
  * `/steden/[stad]/zwemles` (*Zwem-ABC* waitlist ranking, NRZ accreditation & monthly package comparison)
  * `/steden/[stad]/buitenwater` (Outdoor pools & open-water spots + water temperatures)
* **Zero Soft-404 Quality Gate:** Build pipeline only generates and adds a Tier-1 route to `sitemap.xml` if `count(matching_venues) >= 1`.
* **Tier-2 Non-Indexable Micro-Filters:** Granular filters (`?waterbehandeling=zout&nu_open=1&max_prijs=8`) execute client-side and always output `<link rel="canonical">` pointing to the parent Tier-1 route.

### 3. Freshness vs. Static Speed (`3C`)
* **Daily Scheduled Build (05:00 Europe/Amsterdam):** Uses only ~30 of the 500 free monthly Cloudflare builds, baking updated data into static HTML for Googlebot Wave-1.
* **True-Diff `<lastmod>`:** Sitemap `<lastmod>` timestamps only advance when a venue's underlying data hash actually changes.
* **Zero-Request "Nu Open" Status:** Computed in the browser against `Europe/Amsterdam` time from the static schedule embedded in HTML—0 API requests.
* **Dutch Context Engine:** Automatic schedule resolution and warning banners for Dutch *Feestdagen*, regional *Schoolvakanties* (`noord`, `midden`, `zuid`), and *KNMI Code Oranje/Rood* weather alerts.
