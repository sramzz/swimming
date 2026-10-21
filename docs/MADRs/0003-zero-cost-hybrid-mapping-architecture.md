# MADR 0003: Zero-Cost Hybrid Mapping Architecture (Google Maps Lazy `<iframe>` + MapLibre GL)

* **Status:** Accepted
* **Date:** 2026-10-21
* **Deciders:** Engineering / UI & Cost-Control Review

---

## Context and Problem Statement

AlleZwembaden.nl has two distinct mapping experiences across its mockups ([`DesignMockups/`](file:///Users/sramzzs4d/Projects-sramzz/swimming/DesignMockups/)):
1. **Search / City Listing Split-View (`58% Cards / 42% Sticky Map` on Desktop; `"Kaart tonen"` Drawer on Mobile):** Needs interactive HTML price/waitlist/temperature pills (`€ 8,20`, `Zwemles (~6wk)`, `Wetsuit 14°C`), active pin highlighting synced with card hover, and dynamic filtering.
2. **Pool Detail Page (`#locatie` section, e.g., *De Mirandabad*):** Needs a clear location map showing nearby transit stops (*Tram 4 & 12*, *Metro 52*) and 1-click turn-by-turn directions.

Paid mapping APIs (Google Maps JS SDK, Mapbox GL) require a credit card and charge per map/tile load, creating a severe runaway billing risk during traffic spikes or bot crawls. Conversely, hotlinking volunteer OpenStreetMap raster tiles (`tile.openstreetmap.org`) violates OSM's Tile Usage Policy and risks domain blocking.

---

## Decision Drivers

* **100% €0.00 Cost Forever (No API Keys or Credit Cards Attached)**
* **Zero Domain-Blocking Risk under High Traffic**
* **100/100 Lighthouse Performance & AVG/GDPR Cleanliness on Initial Page Load**
* **Support for Custom Tailwind HTML Price Pills & Popover Cards on Listing Pages**

---

## Considered Options

1. **Hybrid: Lazy-Mounted Google Maps Embed `<iframe>` on Detail Pages + Lazy-Loaded MapLibre GL JS (OpenFreeMap / Dutch Gov PDOK Vector Tiles) on Listing Split-View** *(Selected)*
2. **MapLibre GL JS + Self-Hosted NL `.pmtiles` on Cloudflare R2** *(Documented as zero-dependency upgrade path)*
3. **Static Stylized SVG Maps Only (No street-level pan/zoom)**
4. **Leaflet.js + Direct OSM Raster Tiles** *(Rejected due to OSM Tile Usage Policy block risk)*

---

## Decision Outcome

Chosen option: **Option 1 — Hybrid Google Maps Lazy `<iframe>` (Detail Page) + MapLibre GL JS with OpenFreeMap/PDOK Vector Tiles (Listing Page)**.

### 1. Pool Detail Page: Google Maps Embed `<iframe>` with Lazy Scroll/Click Facade
* Standard Google Maps Embed `<iframe src="https://www.google.com/maps/embed?..." loading="lazy" referrerpolicy="strict-origin-when-cross-origin">` is 100% free with unlimited loads and requires no billing account.
* **Lighthouse / CWV Guard:** To prevent Google's ~500 KB iframe bundle from loading during initial page paint or setting third-party cookies prematurely, the component renders a lightweight preview facade and injects the `<iframe>` only when the `#locatie` section enters the viewport via `IntersectionObserver` (or on user interaction).

### 2. Search & City Listing Page: MapLibre GL JS + OpenFreeMap / PDOK Vector Tiles
* Uses open-source **MapLibre GL JS** connected to **OpenFreeMap** (`https://tiles.openfreemap.org/styles/positron` for Light theme and `dark` for Dark theme), with the official Dutch government **PDOK (`BRT Achtergrondkaart`)** vector tile service as a built-in fallback.
* Supports native HTML DOM markers (`new maplibregl.Marker({ element })`), rendering the exact Tailwind price/waitlist/temperature pills and floating preview cards from the mockups.
* **Mobile Performance:** On mobile viewports (`< 1024px`), MapLibre GL JS is **not loaded** until the user taps the floating **"Kaart tonen"** button.
* **Zero-External-Dependency Upgrade Path:** If ever desired, a single `~350 MB` Netherlands `.pmtiles` archive (sliced from OpenStreetMap / Overture Maps) can be dropped into Cloudflare R2 (10 GB free tier, €0 egress) and pointed to via a single URL change in the MapLibre style config.
