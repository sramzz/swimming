# Lessons Learned: Frontend Islands, MapLibre GL & Interactive Navigation

> **Rule ([`PHILOSOPHY.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/PHILOSOPHY.md#L85)):** *"Every mistake and experiment failed becomes part of a Markdown file, we have a markdown file for different types of mistakes. We pay for a lesson once!"*

---

## Lesson 1: Never Overwrite `.className` on a MapLibre GL `Marker` Root Element

### What Happened
On the homepage map (`src/components/islands/ListingMapIsland.tsx`), price markers initially appeared shifted into Germany (`Hamburg`, `Berlin`, `Dresden`) and disappeared when hovering over listing cards.

### Root Cause
1. When `new maplibregl.Marker({ element: el })` is called, MapLibre GL attaches two critical classes to `el`:
   - `maplibregl-marker` (`position: absolute; top: 0; left: 0; will-change: transform;`)
   - `maplibregl-marker-anchor-center`
   and positions the marker via inline `style="transform: translate(Xpx, Ypx)"`.
2. In our `useEffect([selectedVenue, hoveredVenueId])` hook, we updated marker styling by assigning:
   ```ts
   item.el.className = 'px-2.5 py-1 rounded-full ... transition-all scale-110';
   ```
3. Assigning `item.el.className = '...'` **wiped out `maplibregl-marker`**, causing every marker `<button>` to lose `position: absolute; top: 0; left: 0` and fall back to normal static/inline DOM flow across the top of the map container, while still having `transform: translate(Xpx, Ypx)` applied on top of its static flow offset!
4. Additionally, placing Tailwind's `transition-all` and `scale-110` on the same element that MapLibre mutates via `style.transform` caused CSS transforms and transitions to fight MapLibre's coordinate projection during pan/zoom/hover.

### Prevention Rule (Mandatory)
- **Always separate the MapLibre positioning wrapper from the styled UI child:**
  ```ts
  const wrapperEl = document.createElement('div');
  wrapperEl.className = 'zwemkaart-marker-wrapper'; // MapLibre adds .maplibregl-marker here
  const pillBtn = document.createElement('button');
  pillBtn.type = 'button';
  wrapperEl.appendChild(pillBtn);
  const marker = new maplibregl.Marker({ element: wrapperEl, anchor: 'center' })
    .setLngLat([venue.lng, venue.lat])
    .addTo(map);
  ```
- **Never mutate `wrapperEl.className` or apply CSS `transform` / `scale-*` / `transition-all` to `wrapperEl`.** Only mutate `pillBtn.className`!
- Enforce with an automated unit test (`tests/components/islands/listing-map-island.test.ts`) asserting `wrapperEl.classList.contains('maplibregl-marker')` remains `true` after selection and hover events.

---

## Lesson 2: Never Ship Unwired Header Buttons or Hash Links (`/#...`) Without Target DOM Anchors

### What Happened
During the visual overhaul:
1. `Word Aanbieder` linked to `/#aanbieder`, which did not exist on `/`.
2. The User/Favorites pill linked to `/#favorieten`, which did not exist on `/`.
3. The Globe language/region button (`aria-label="Taalkeuze"`) had no click handler.
4. On Facility Detail pages (`/zwembad/[stad]/[slug]`), `StickyBookingWidgetIsland` only checked `venue.official_tickets_url` (which was `null` for 996 of 1,002 venues) without falling back to `venue.official_website_url`, and rendered a ticket calculator on natural open-water lakes (`OPEN_WATER_NATURAL`) where no tickets or swim lessons exist.

### Prevention Rule (Mandatory)
- Every `<a href="...">` in `Header.astro`, `Footer.astro`, and page templates must resolve to either:
  1. A real built route in `dist/` (e.g., `/aanbieder`, `/steden`, `/steden/amsterdam`), or
  2. An `id="..."` anchor that actually exists on the target page.
- Every `<button type="button">` in static `.astro` components must have a wired event listener or `<dialog>` / popover controller tested in `tests/pages/navigation-and-links-audit.test.ts`.
- On `/zwembad/[stad]/[slug]`, always adapt the right-hand sticky widget to the venue's domain type (`OPEN_WATER_NATURAL` shows the official `Zwemwater.nl` water-quality, access, & information board card; indoor/outdoor pools show the ticket & Zwem-ABC widget with fallback to `official_website_url`).

---

## Lesson 3: Render Image Galleries as Native Scroll-Snap Tracks in SSR HTML (Mobile Touch + Google Images)

### What Happened
Initially, card image carousels only rendered a single `<img src={photos[activeIdx].url}>` swapped in JavaScript when desktop hover arrows (`opacity-0 group-hover:opacity-100`) were clicked, and the facility detail page hid photos 2–5 on mobile (`hidden md:block`). This caused two problems:
1. On mobile phones, horizontal touch swiping on pool images did nothing, and hover-only chevron arrows (`opacity-0 group-hover:opacity-100`) were invisible on touch devices.
2. Googlebot and Google Images could only discover `photos[0]` on listing cards instead of all photos with their `alt` text and explicit dimensions.

### Prevention Rule (Mandatory)
- **Always use native CSS Scroll Snap (`overflow-x: auto; scroll-snap-type: x mandatory; scroll-snap-stop: always`)** with all `<img>` slides present in initial HTML (`.carousel-scroll-track` + `.carousel-scroll-slide`), giving each image explicit `width`, `height`, and Dutch `alt`, with `fetchpriority="high"` only on the single LCP hero/first-card image and `fetchpriority="low" loading="lazy"` on off-screen slides.
- **Map preview cards** (`ListingMapIsland`) must expose the same horizontal swipe track plus always-visible Prev/Next controls and clickable dot indicators so touch and mouse users alike can browse pool photos directly on the map.
- **Every interactive filter link that corresponds to a real SEO page** (like city pills) should render as an `<a href="/steden/...">` link (intercepting simple left-clicks in JS for instant filtering) rather than a `<button>` that hides internal links from Googlebot.
