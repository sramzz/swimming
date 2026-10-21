# Milestone 3 Implementation Plan: `Aquatic Discovery` Design System & Zero-JS SEO Pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `Aquatic Discovery` Light & Dark design system tokens from [`DesignMockups/`](file:///Users/sramzzs4d/Projects-sramzz/swimming/DesignMockups/), build the zero-JS static Astro components, render the Facility Detail page (`/zwembad/[stad]/[slug]`), Homepage (`/`), Tier-1 City Intent pages (`/steden/[stad]/...`), and the True-Diff `sitemap.xml.ts`.

**Architecture:** Astro 5 compiles all SEO pages to pure static HTML (`0 KB` framework runtime for content, pricing tables, schedules, and JSON-LD). Browser Speculation Rules prefetch facility detail links on hover for instant navigation.

**Tech Stack:** Astro 5, Tailwind CSS v4 (`@theme`), TypeScript, Vitest (for verifying generated static HTML & sitemap output).

---

### Task 3.1: Configure `Aquatic Discovery` Design Tokens (`src/styles/global.css`) & `BaseLayout.astro`

**Files:**
- Create: `src/styles/global.css`
- Create: `src/layouts/BaseLayout.astro`

- [x] **Step 1: Create `src/styles/global.css` with exact Light & Dark tokens from `DESIGN.md`**

```css
@import "tailwindcss";

@theme {
  --font-sans: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;

  /* Light Mode Aquatic Discovery Tokens */
  --color-surface-pure: #ffffff;
  --color-surface: #fcf9f8;
  --color-surface-subtle: #f7f7f7;
  --color-surface-container: #f0eded;
  --color-border-hairline: #ebebeb;
  --color-border-strong: #dddddd;
  --color-text-charcoal: #222222;
  --color-text-muted: #717171;
  --color-primary: #00696d;
  --color-primary-container: #008489;
  --color-on-primary: #ffffff;
  --color-secondary: #006398;
  --color-accent-seasonal: #f97316;
  --color-badge-teal-bg: #e6f4f5;
  --color-badge-amber-bg: #fff7ed;
}

.dark {
  --color-surface-pure: #0f172a;
  --color-surface: #0b1326;
  --color-surface-subtle: #1e293b;
  --color-surface-container: #334155;
  --color-border-hairline: #334155;
  --color-border-strong: #475569;
  --color-text-charcoal: #f8fafc;
  --color-text-muted: #94a3b8;
  --color-primary: #06b6d4;
  --color-primary-container: #0ea5e9;
  --color-on-primary: #0f172a;
  --color-badge-teal-bg: #164e63;
  --color-badge-amber-bg: #431407;
}
```

- [x] **Step 2: Create `src/layouts/BaseLayout.astro` with Canonical URL, JSON-LD, and Speculation Rules**

```astro
---
import '../styles/global.css';

interface Props {
  title: string;
  description: string;
  canonicalPath: string;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
}

const { title, description, canonicalPath, jsonLd } = Astro.props;
const canonicalUrl = new URL(canonicalPath, 'https://allezwembaden.nl').toString();
---
<!doctype html>
<html lang="nl" class="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={canonicalUrl} />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
      rel="stylesheet"
    />
    {jsonLd && (
      <script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />
    )}
    <script type="speculationrules" is:inline>
      {
        "prerender": [
          {
            "where": { "href_matches": "/zwembad/*" },
            "eagerness": "moderate"
          }
        ],
        "prefetch": [
          {
            "where": { "href_matches": "/steden/*" },
            "eagerness": "moderate"
          }
        ]
      }
    </script>
  </head>
  <body class="bg-surface-pure text-text-charcoal antialiased min-h-screen flex flex-col font-sans">
    <slot />
  </body>
</html>
```

- [x] **Step 3: Commit layout and design tokens**

```bash
git add src/styles/global.css src/layouts/BaseLayout.astro
git commit -m "feat(ui): add Aquatic Discovery Light/Dark tokens and BaseLayout with Speculation Rules"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 3.1 `[x]`:**
> 1. `src/styles/global.css` defines all Light & Dark `Aquatic Discovery` CSS variables inside `@theme` and `.dark`.
> 2. `src/layouts/BaseLayout.astro` renders `<link rel="canonical">`, optional `<script type="application/ld+json">`, and `<script type="speculationrules">`.
> 3. Changes are committed and all checkboxes in Task 3.1 are marked `[x]`.

---

### Task 3.2: Build Static Design System Components (`src/components/*.astro`)

**Files:**
- Create: `src/components/WaterTreatmentBadge.astro`
- Create: `src/components/AlertBanner.astro`
- Create: `src/components/VenueCard.astro`
- Create: `src/components/LazyGoogleMapIframe.astro`
- Create: `src/components/Header.astro`
- Create: `src/components/Footer.astro`

- [x] **Step 1: Create `src/components/WaterTreatmentBadge.astro`, `AlertBanner.astro`, `LazyGoogleMapIframe.astro`, `VenueCard.astro`, `Header.astro`, and `Footer.astro`**

Create `src/components/WaterTreatmentBadge.astro`:
```astro
---
interface Props {
  treatment: 'SALT_ELECTROLYSIS' | 'TRADITIONAL_CHLORINE' | 'UV_LOW_CHLORINE' | 'NATURAL_UNTREATED';
}
const { treatment } = Astro.props;

const map = {
  SALT_ELECTROLYSIS: {
    label: 'Zoutelektrolyse (Zacht water)',
    classes: 'bg-emerald-50 text-emerald-800 border-emerald-200/60',
  },
  TRADITIONAL_CHLORINE: {
    label: 'Traditioneel chloor',
    classes: 'bg-surface-subtle text-text-charcoal border-border-hairline',
  },
  UV_LOW_CHLORINE: {
    label: 'UV & Laag chloor',
    classes: 'bg-badge-teal-bg text-primary border-primary/20',
  },
  NATURAL_UNTREATED: {
    label: 'Natuurwater (Onbehandeld / Schoon)',
    classes: 'bg-cyan-50 text-cyan-800 border-cyan-200/60',
  },
};
const item = map[treatment];
---
<span class={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${item.classes}`}>
  {item.label}
</span>
```

Create `src/components/AlertBanner.astro`:
```astro
---
interface Props {
  severity: 'NONE' | 'INFO' | 'WARNING' | 'CRITICAL';
  messageNl: string | null;
  wetsuitMessageNl?: string | null;
}
const { severity, messageNl, wetsuitMessageNl } = Astro.props;
---
{messageNl && severity !== 'NONE' && (
  <div
    role="status"
    class:list={[
      'p-4 rounded-xl border text-sm font-medium mb-4',
      severity === 'CRITICAL' && 'bg-red-50 border-red-300 text-red-900',
      severity === 'WARNING' && 'bg-badge-amber-bg border-accent-seasonal/40 text-text-charcoal',
      severity === 'INFO' && 'bg-badge-teal-bg border-primary/30 text-primary',
    ]}
  >
    {messageNl}
  </div>
)}
{wetsuitMessageNl && (
  <div class="p-4 rounded-xl border border-accent-seasonal/30 bg-badge-amber-bg text-accent-seasonal text-sm font-semibold mb-4">
    {wetsuitMessageNl}
  </div>
)}
```

Create `src/components/LazyGoogleMapIframe.astro`:
```astro
---
interface Props {
  venueName: string;
  streetAddress: string | null;
  embedUrl: string | null;
  routeUrl: string | null;
}
const { venueName, streetAddress, embedUrl, routeUrl } = Astro.props;
---
<div class="w-full rounded-2xl border border-border-hairline overflow-hidden bg-surface-subtle p-4" data-lazy-map-container>
  <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
    <div>
      <p class="font-bold text-text-charcoal">{venueName}</p>
      {streetAddress && <p class="text-sm text-text-muted">{streetAddress}</p>}
    </div>
    {routeUrl && (
      <a
        href={routeUrl}
        target="_blank"
        rel="noopener noreferrer"
        class="px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-bold hover:opacity-95"
      >
        Route openen in Google Maps ↗
      </a>
    )}
  </div>
  {embedUrl ? (
    <div class="w-full h-64 rounded-xl overflow-hidden bg-surface-container">
      <iframe
        src={embedUrl}
        title={`Kaart van ${venueName}`}
        width="100%"
        height="100%"
        style="border:0;"
        allowfullscreen=""
        loading="lazy"
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>
    </div>
  ) : (
    <p class="text-xs text-text-muted">Interactieve routekaart beschikbaar via Google Maps.</p>
  )}
</div>
```

Create `src/components/VenueCard.astro`:
```astro
---
import WaterTreatmentBadge from './WaterTreatmentBadge.astro';
import { formatEuroCentsNl } from '../domain/seo-aggregator';
import type { VenueRow } from '../db/queries';

interface Props {
  venue: VenueRow;
}
const { venue } = Astro.props;
const href = `/zwembad/${venue.municipality_slug}/${venue.slug}`;
---
<article class="group flex flex-col border border-border-hairline rounded-2xl p-4 bg-surface-pure hover:shadow-md transition-all">
  <div class="flex items-start justify-between gap-2">
    <a href={href} class="text-lg font-bold text-text-charcoal group-hover:text-primary transition-colors">
      {venue.name}
    </a>
    {venue.rating_score && (
      <span class="text-xs font-bold text-text-charcoal shrink-0">
        ★ {venue.rating_score.toFixed(2)} ({venue.rating_count})
      </span>
    )}
  </div>
  <p class="text-sm text-text-muted mt-0.5">
    {venue.neighborhood_name ?? venue.municipality_slug}
  </p>
  <div class="mt-3 flex flex-wrap items-center gap-1.5">
    {venue.featured_badge_nl && (
      <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-badge-teal-bg text-primary">
        {venue.featured_badge_nl}
      </span>
    )}
    <WaterTreatmentBadge treatment={venue.primary_water_treatment} />
  </div>
  <div class="mt-4 pt-3 border-t border-border-hairline flex items-baseline justify-between">
    <span class="text-sm font-bold text-text-charcoal">
      {venue.min_single_price_cents === 0
        ? 'Gratis toegang'
        : venue.min_single_price_cents
          ? `Vanaf ${formatEuroCentsNl(venue.min_single_price_cents)}`
          : 'Prijs op aanvraag'}
    </span>
    <a href={href} class="text-xs font-semibold text-primary hover:underline">
      Bekijk rooster & zwemles →
    </a>
  </div>
</article>
```

Create `src/components/Header.astro` and `src/components/Footer.astro`:
```astro
---
// src/components/Header.astro
---
<header class="bg-surface-pure border-b border-border-hairline sticky top-0 z-40">
  <div class="max-w-7xl mx-auto px-4 md:px-8 h-20 flex items-center justify-between gap-4">
    <a href="/" class="text-xl font-extrabold text-primary tracking-tight">
      AlleZwembaden<span class="text-accent-seasonal">.nl</span>
    </a>
    <nav aria-label="Hoofdnavigatie" class="hidden md:flex items-center gap-6 text-sm font-semibold text-text-muted">
      <a href="/steden/amsterdam" class="hover:text-primary">Amsterdam</a>
      <a href="/steden/amsterdam/banenzwemmen" class="hover:text-primary">Banenzwemmen</a>
      <a href="/steden/amsterdam/zwemles" class="hover:text-primary">Zwemles A/B/C</a>
      <a href="/steden/amsterdam/buitenwater" class="hover:text-primary">Buiten & Natuurwater</a>
    </nav>
  </div>
</header>
```

```astro
---
// src/components/Footer.astro
---
<footer class="mt-auto bg-surface-subtle border-t border-border-hairline py-8">
  <div class="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-text-muted">
    <p>© 2026 AlleZwembaden.nl — Onafhankelijk platform voor zwembaden, Zwem-ABC wachttijden & zwemwater.</p>
    <div class="flex flex-wrap gap-4">
      <a href="/steden/amsterdam" class="hover:text-primary">Amsterdam</a>
      <a href="/steden/utrecht" class="hover:text-primary">Utrecht</a>
      <a href="/steden/eindhoven" class="hover:text-primary">Eindhoven</a>
      <a href="/sitemap.xml" class="hover:text-primary">Sitemap</a>
    </div>
  </div>
</footer>
```

- [x] **Step 2: Commit static design system components**

```bash
git add src/components/
git commit -m "feat(ui): add static Aquatic Discovery Astro components"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 3.2 `[x]`:**
> 1. `WaterTreatmentBadge.astro`, `AlertBanner.astro`, `LazyGoogleMapIframe.astro`, `VenueCard.astro`, `Header.astro`, and `Footer.astro` exist in `src/components/`.
> 2. `LazyGoogleMapIframe.astro` uses `loading="lazy"` and requires zero API keys or initial client JS.
> 3. Changes are committed and all checkboxes in Task 3.2 are marked `[x]`.

---

### Task 3.3: Build Facility Detail Page (`src/pages/zwembad/[stad]/[slug].astro`) & Tier-1 City Pages

**Files:**
- Create: `src/db/runtime-db.ts`
- Create: `src/pages/zwembad/[stad]/[slug].astro`
- Create: `src/pages/index.astro`
- Create: `src/pages/steden/[stad]/index.astro`
- Create: `src/pages/steden/[stad]/[intent].astro`
- Create: `src/pages/sitemap.xml.ts`
- Test: `tests/pages/seo-build.test.ts`

- [x] **Step 1: Write the failing test in `tests/pages/seo-build.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { getBuildDatabase } from '@/db/runtime-db';
import { listAllVenues, getVenueByCityAndSlug } from '@/db/queries';
import { buildVenueJsonLd } from '@/domain/seo-aggregator';

describe('Static Page & Sitemap Data Generation', () => {
  it('loads seeded venues and constructs valid canonical URLs and JSON-LD', () => {
    const db = getBuildDatabase();
    const venues = listAllVenues(db);
    expect(venues.length).toBeGreaterThanOrEqual(6);

    const miranda = getVenueByCityAndSlug(db, 'amsterdam', 'de-mirandabad');
    expect(miranda).not.toBeNull();
    const jsonLd = buildVenueJsonLd({
      name: miranda!.name,
      slug: miranda!.slug,
      citySlug: miranda!.municipality_slug,
      cityName: 'Amsterdam',
      streetAddress: miranda!.street_address,
      postcode: miranda!.postcode_pc6,
      lat: miranda!.lat,
      lng: miranda!.lng,
      ratingScore: miranda!.rating_score,
      ratingCount: miranda!.rating_count,
      minPriceCents: miranda!.min_single_price_cents,
      waterTreatment: miranda!.primary_water_treatment,
    });
    expect(jsonLd.url).toBe('https://allezwembaden.nl/zwembad/amsterdam/de-mirandabad');
    db.close();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/pages/seo-build.test.ts`
Expected: FAIL (`Cannot find module '@/db/runtime-db'`).

- [x] **Step 3: Implement `src/db/runtime-db.ts` and the Astro pages (`index.astro`, `zwembad/[stad]/[slug].astro`, `steden/[stad]/index.astro`, `steden/[stad]/[intent].astro`, `sitemap.xml.ts`)**

Create `src/db/runtime-db.ts`:
```typescript
import path from 'node:path';
import fs from 'node:fs';
import { createDatabase, applyDetailedSchema, type SqliteDatabase } from './client';
import { seedInitialDataset } from './seed';

export function getBuildDatabase(): SqliteDatabase {
  const dbPath = path.resolve(process.cwd(), 'data/allezwembaden.sqlite');
  const exists = fs.existsSync(dbPath);
  const db = createDatabase(dbPath);
  if (!exists) {
    applyDetailedSchema(db);
    seedInitialDataset(db);
  } else {
    const hasTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='venues'")
      .get();
    if (!hasTable) {
      applyDetailedSchema(db);
      seedInitialDataset(db);
    }
  }
  return db;
}
```

Create `src/pages/zwembad/[stad]/[slug].astro`:
```astro
---
import BaseLayout from '../../../layouts/BaseLayout.astro';
import Header from '../../../components/Header.astro';
import Footer from '../../../components/Footer.astro';
import WaterTreatmentBadge from '../../../components/WaterTreatmentBadge.astro';
import LazyGoogleMapIframe from '../../../components/LazyGoogleMapIframe.astro';
import { getBuildDatabase } from '../../../db/runtime-db';
import { listAllVenues, getVenueByCityAndSlug } from '../../../db/queries';
import { buildVenueJsonLd, formatEuroCentsNl } from '../../../domain/seo-aggregator';

export async function getStaticPaths() {
  const db = getBuildDatabase();
  const venues = listAllVenues(db);
  db.close();
  return venues.map((v) => ({
    params: { stad: v.municipality_slug, slug: v.slug },
  }));
}

const { stad, slug } = Astro.params;
const db = getBuildDatabase();
const venue = getVenueByCityAndSlug(db, stad!, slug!);
db.close();

if (!venue) {
  throw new Error(`Venue not found: ${stad}/${slug}`);
}

const jsonLd = buildVenueJsonLd({
  name: venue.name,
  slug: venue.slug,
  citySlug: venue.municipality_slug,
  cityName: venue.municipality_slug,
  streetAddress: venue.street_address,
  postcode: venue.postcode_pc6,
  lat: venue.lat,
  lng: venue.lng,
  ratingScore: venue.rating_score,
  ratingCount: venue.rating_count,
  minPriceCents: venue.min_single_price_cents,
  waterTreatment: venue.primary_water_treatment,
});
---
<BaseLayout
  title={`${venue.name} - Prijzen, Banenzwemmen & Zwemles | AlleZwembaden.nl`}
  description={`Bekijk actuele entreeprijzen, banenzwemmen tijden, watertemperatuur en Zwem-ABC wachttijden bij ${venue.name}.`}
  canonicalPath={`/zwembad/${venue.municipality_slug}/${venue.slug}`}
  jsonLd={jsonLd}
>
  <Header />
  <main class="max-w-7xl mx-auto px-4 md:px-8 py-8 flex-1 w-full">
    <nav aria-label="Broodkruimelpad" class="text-xs text-text-muted mb-4 flex items-center gap-2">
      <a href="/" class="hover:underline">Nederland</a>
      <span>›</span>
      <a href={`/steden/${venue.municipality_slug}`} class="hover:underline capitalize">{venue.municipality_slug}</a>
      <span>›</span>
      <span class="text-text-charcoal font-semibold">{venue.name}</span>
    </nav>

    <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-border-hairline">
      <div>
        <h1 class="text-3xl font-extrabold text-text-charcoal">{venue.name}</h1>
        <div class="flex flex-wrap items-center gap-2 mt-2 text-sm text-text-muted">
          {venue.rating_score && (
            <span class="font-bold text-text-charcoal">★ {venue.rating_score} ({venue.rating_count} reviews)</span>
          )}
          {venue.municipal_keurmerk_label && (
            <span class="text-primary font-semibold">• {venue.municipal_keurmerk_label}</span>
          )}
          <WaterTreatmentBadge treatment={venue.primary_water_treatment} />
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 mt-8 items-start">
      <div class="lg:col-span-8 space-y-8">
        <section>
          <h2 class="text-xl font-bold mb-4">Baden & Watertemperatuur</h2>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {venue.basins.map((b) => (
              <div class="p-4 rounded-xl border border-border-hairline bg-surface-pure">
                <span class="text-xs font-bold text-text-muted uppercase block">{b.name_nl}</span>
                <div class="text-2xl font-extrabold text-primary mt-1">
                  {b.target_temp_celsius
                    ? `${b.target_temp_celsius.toFixed(1)}°C`
                    : venue.outdoor_temp_celsius
                      ? `${venue.outdoor_temp_celsius.toFixed(1)}°C`
                      : 'Natuurwater'}
                </div>
                {b.warm_water_day_note_nl && (
                  <p class="text-xs text-text-muted mt-1">{b.warm_water_day_note_nl}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {venue.tariffs.length > 0 && (
          <section>
            <h2 class="text-xl font-bold mb-4">Tarieven & Abonnementen</h2>
            <div class="border border-border-hairline rounded-2xl divide-y divide-border-hairline overflow-hidden">
              {venue.tariffs.map((t) => (
                <div class="p-4 flex items-center justify-between">
                  <div>
                    <span class="font-semibold text-text-charcoal">{t.title_nl}</span>
                    {t.subtitle_nl && <p class="text-xs text-text-muted">{t.subtitle_nl}</p>}
                  </div>
                  <span class="text-lg font-bold text-text-charcoal">{formatEuroCentsNl(t.price_cents)}</span>
                </div>
              ))}
            </div>
            {venue.municipal_pass_discount_nl && (
              <p class="mt-3 text-xs text-emerald-800 bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                <strong>{venue.municipal_pass_name}:</strong> {venue.municipal_pass_discount_nl}
              </p>
            )}
          </section>
        )}

        {venue.offerings.length > 0 && (
          <section>
            <h2 class="text-xl font-bold mb-4">Zwemles A/B/C & Wachttijd</h2>
            {venue.offerings.map((o) => (
              <div class="p-5 rounded-2xl border-2 border-primary/20 bg-badge-teal-bg/40 flex flex-col md:flex-row justify-between gap-4">
                <div>
                  <h3 class="font-bold text-text-charcoal">{o.provider_name} ({o.diploma_track})</h3>
                  <p class="text-sm text-text-muted mt-1">
                    Gemiddelde wachttijd: <strong>{o.current_waitlist_weeks_min} tot {o.current_waitlist_weeks_max} weken</strong>
                  </p>
                  {o.direct_spots_note_nl && (
                    <p class="text-xs font-semibold text-primary mt-1">{o.direct_spots_note_nl}</p>
                  )}
                </div>
                {o.registration_url && (
                  <a
                    href={o.registration_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="self-start px-5 py-2.5 rounded-full bg-primary text-on-primary text-xs font-bold"
                  >
                    Inschrijven op officiële website ↗
                  </a>
                )}
              </div>
            ))}
          </section>
        )}

        <section id="locatie">
          <h2 class="text-xl font-bold mb-4">Locatie & Bereikbaarheid</h2>
          <LazyGoogleMapIframe
            venueName={venue.name}
            streetAddress={venue.street_address}
            embedUrl={venue.google_maps_embed_url}
            routeUrl={venue.google_maps_route_url}
          />
        </section>
      </div>

      <aside class="lg:col-span-4 sticky top-28 p-6 rounded-2xl border border-border-hairline shadow-lg bg-surface-pure">
        <div class="pb-4 border-b border-border-hairline">
          <span class="text-2xl font-extrabold text-text-charcoal">
            {venue.min_single_price_cents === 0
              ? 'Gratis toegang'
              : venue.min_single_price_cents
                ? `Vanaf ${formatEuroCentsNl(venue.min_single_price_cents)}`
                : 'Tarieven'}
          </span>
          <span class="block text-xs text-text-muted">per losse entree</span>
        </div>
        {venue.official_tickets_url && (
          <a
            href={venue.official_tickets_url}
            target="_blank"
            rel="noopener noreferrer"
            class="mt-4 w-full h-11 rounded-full bg-primary text-on-primary text-sm font-bold flex items-center justify-center"
          >
            Koop Tickets op Officiële Website ↗
          </a>
        )}
      </aside>
    </div>
  </main>
  <Footer />
</BaseLayout>
```

Create `src/pages/index.astro`, `src/pages/steden/[stad]/index.astro`, `src/pages/steden/[stad]/[intent].astro`, and `src/pages/sitemap.xml.ts`:
```astro
---
// src/pages/index.astro
import BaseLayout from '../layouts/BaseLayout.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import VenueCard from '../components/VenueCard.astro';
import { getBuildDatabase } from '../db/runtime-db';
import { listAllVenues } from '../db/queries';

const db = getBuildDatabase();
const venues = listAllVenues(db);
db.close();
---
<BaseLayout
  title="AlleZwembaden.nl - Vind, vergelijk en boek zwembaden & zwemles in Nederland"
  description="Vergelijk binnenbaden, subtropische zwembaden, banenzwemmen tijden, zoutelektrolyse, Zwem-ABC wachttijden en natuurwater in Nederland."
  canonicalPath="/"
>
  <Header />
  <main class="max-w-7xl mx-auto px-4 md:px-8 py-8 flex-1 w-full">
    <h1 class="text-2xl font-extrabold text-text-charcoal mb-6">
      Zwemlocaties & Zwemles in Nederland ({venues.length} uitgelichte locaties)
    </h1>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {venues.map((venue) => <VenueCard venue={venue} />)}
    </div>
  </main>
  <Footer />
</BaseLayout>
```

```astro
---
// src/pages/steden/[stad]/index.astro
import BaseLayout from '../../../layouts/BaseLayout.astro';
import Header from '../../../components/Header.astro';
import Footer from '../../../components/Footer.astro';
import VenueCard from '../../../components/VenueCard.astro';
import { getBuildDatabase } from '../../../db/runtime-db';
import { listVenuesByCity } from '../../../db/queries';
import { buildCitySeoSummaryNl } from '../../../domain/seo-aggregator';

export async function getStaticPaths() {
  const db = getBuildDatabase();
  const cities = db.prepare('SELECT slug, name FROM municipalities').all() as Array<{ slug: string; name: string }>;
  const paths = cities
    .filter((c) => listVenuesByCity(db, c.slug).length >= 1)
    .map((c) => ({ params: { stad: c.slug }, props: { cityName: c.name } }));
  db.close();
  return paths;
}

const { stad } = Astro.params;
const { cityName } = Astro.props;
const db = getBuildDatabase();
const venues = listVenuesByCity(db, stad!);
db.close();

const paid = venues.filter((v) => v.min_single_price_cents && v.min_single_price_cents > 0);
const cheapest = paid.sort((a, b) => (a.min_single_price_cents ?? 9999) - (b.min_single_price_cents ?? 9999))[0];
const summaryNl = buildCitySeoSummaryNl({
  cityName,
  totalVenues: venues.length,
  saltWaterCount: venues.filter((v) => v.primary_water_treatment === 'SALT_ELECTROLYSIS').length,
  cheapestSinglePriceCents: cheapest?.min_single_price_cents ?? null,
  cheapestVenueName: cheapest?.name ?? null,
  shortestWaitlistWeeks: 4,
});
---
<BaseLayout
  title={`Zwembaden in ${cityName} - Prijzen, Banenzwemmen & Zwemles | AlleZwembaden.nl`}
  description={summaryNl}
  canonicalPath={`/steden/${stad}`}
>
  <Header />
  <main class="max-w-7xl mx-auto px-4 md:px-8 py-8 flex-1 w-full">
    <h1 class="text-3xl font-extrabold text-text-charcoal mb-2">Zwembaden in {cityName}</h1>
    <p class="text-sm text-text-muted mb-6">{summaryNl}</p>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {venues.map((v) => <VenueCard venue={v} />)}
    </div>
  </main>
  <Footer />
</BaseLayout>
```

```astro
---
// src/pages/steden/[stad]/[intent].astro
import BaseLayout from '../../../layouts/BaseLayout.astro';
import Header from '../../../components/Header.astro';
import Footer from '../../../components/Footer.astro';
import VenueCard from '../../../components/VenueCard.astro';
import { getBuildDatabase } from '../../../db/runtime-db';
import { listVenuesByCity } from '../../../db/queries';
import { shouldGenerateIndexableFacetPage } from '../../../domain/seo-aggregator';

export async function getStaticPaths() {
  const db = getBuildDatabase();
  const cities = db.prepare('SELECT slug, name FROM municipalities').all() as Array<{ slug: string; name: string }>;
  const intents = ['banenzwemmen', 'zwemles', 'buitenwater'] as const;
  const paths: Array<{ params: { stad: string; intent: string }; props: { cityName: string } }> = [];

  for (const city of cities) {
    const allVenues = listVenuesByCity(db, city.slug);
    for (const intent of intents) {
      const matching =
        intent === 'buitenwater'
          ? allVenues.filter((v) => v.venue_type === 'OPEN_WATER_NATURAL' || v.venue_type === 'INDOOR_AND_OUTDOOR')
          : allVenues.filter((v) => v.venue_type !== 'OPEN_WATER_NATURAL');
      if (shouldGenerateIndexableFacetPage(matching.length)) {
        paths.push({ params: { stad: city.slug, intent }, props: { cityName: city.name } });
      }
    }
  }
  db.close();
  return paths;
}

const { stad, intent } = Astro.params;
const { cityName } = Astro.props;
const db = getBuildDatabase();
const allVenues = listVenuesByCity(db, stad!);
db.close();

const venues =
  intent === 'buitenwater'
    ? allVenues.filter((v) => v.venue_type === 'OPEN_WATER_NATURAL' || v.venue_type === 'INDOOR_AND_OUTDOOR')
    : allVenues.filter((v) => v.venue_type !== 'OPEN_WATER_NATURAL');
---
<BaseLayout
  title={`${intent} in ${cityName} | AlleZwembaden.nl`}
  description={`Overzicht voor ${intent} in ${cityName}.`}
  canonicalPath={`/steden/${stad}/${intent}`}
>
  <Header />
  <main class="max-w-7xl mx-auto px-4 md:px-8 py-8 flex-1 w-full">
    <h1 class="text-3xl font-extrabold text-text-charcoal capitalize mb-6">{intent} in {cityName}</h1>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {venues.map((v) => <VenueCard venue={v} />)}
    </div>
  </main>
  <Footer />
</BaseLayout>
```

```typescript
// src/pages/sitemap.xml.ts
import type { APIRoute } from 'astro';
import { getBuildDatabase } from '../db/runtime-db';
import { listAllVenues } from '../db/queries';

export const GET: APIRoute = () => {
  const db = getBuildDatabase();
  const venues = listAllVenues(db);
  db.close();

  const urls = [
    `<url><loc>https://allezwembaden.nl/</loc></url>`,
    ...venues.map(
      (v) =>
        `<url><loc>https://allezwembaden.nl/zwembad/${v.municipality_slug}/${v.slug}</loc><lastmod>${v.lastmod_at}</lastmod></url>`
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
```

- [x] **Step 4: Run tests and Astro static build to verify output**

Run: `pnpm test && pnpm build`
Expected: All tests PASS and `pnpm build` outputs static pages in `dist/zwembad/amsterdam/de-mirandabad/index.html`, `dist/steden/amsterdam/index.html`, and `dist/sitemap.xml`.

- [x] **Step 5: Commit SEO pages and sitemap**

```bash
git add src/db/runtime-db.ts src/pages/ tests/pages/seo-build.test.ts
git commit -m "feat(seo): add static facility pages, Two-Tier city intent routes, and True-Diff sitemap"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 3.3 `[x]`:**
> 1. You observed `tests/pages/seo-build.test.ts` **FAIL** in Step 2 before creating `src/db/runtime-db.ts`.
> 2. `pnpm test && pnpm build` exits with code `0`.
> 3. Static HTML files exist in `dist/zwembad/amsterdam/de-mirandabad/index.html`, `dist/steden/amsterdam/index.html`, and `dist/sitemap.xml`.
> 4. Changes are committed and all checkboxes in Task 3.3 are marked `[x]`.

---

## 🛑 Milestone 3 Verification Gate (Check All Before Starting Milestone 4!)

- [x] `pnpm test` passes 100% of unit and build tests.
- [x] `pnpm build` completes with exit code `0`.
- [x] `dist/zwembad/amsterdam/de-mirandabad/index.html` contains `<script type="application/ld+json">` with `"@type":"PublicSwimmingPool"` and `<link rel="canonical" href="https://allezwembaden.nl/zwembad/amsterdam/de-mirandabad">`.
