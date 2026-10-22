# Milestone 6 Implementation Plan: Full Page Wiring, Mockup Polish, Multi-Account `cf` CLI Guardrail & CI/CD

> **For agentic workers & Junior developers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 4 integration gaps left after Milestone 5 by mounting the Preact interactive islands into the Astro pages, rendering the full *De Mirandabad* mockup sections (5-photo hero grid, *Banenzwemmen* timetable, transit chips, and holiday/KNMI `<AlertBanner />`), wiring the HTTP API routes (`/api/health.json`, `/api/leads`, `/api/clicks`), enforcing the **Multi-Account Cloudflare `cf` CLI Profile Guardrail (`--profile allezwembaden`)**, and adding GitHub Actions CI/CD workflows.

**Architecture:**
1. **Multi-Account `cf` CLI Isolation:** This PC already has a `default` profile in `cf` CLI belonging to another Cloudflare account. All Cloudflare commands MUST use the dedicated named profile `allezwembaden` bound to this repository directory (`cf auth create allezwembaden && cf auth activate allezwembaden .`) and verified by `src/cli/verify-cf-profile.ts`.
2. **Progressive Enhancement for SEO + Interactivity:** `index.astro` and `zwembad/[stad]/[slug].astro` keep 100% of their crawlable static HTML and JSON-LD for Googlebot while hydrating `StickyBookingWidgetIsland`, `SearchAndFilterIsland`, and `ListingMapIsland` (`58%` cards / `42%` sticky map split-view).

**Tech Stack:** Astro 5, Preact, Tailwind CSS v4, MapLibre GL JS, Cloudflare `cf` CLI (`v1.0.0-beta.20+`), Oxlint, Vitest.

---

### Task 6.1: Git Hygiene (`.gitignore`), Run-History Updater & Multi-Account `cf` Profile Guardrail

> **Why (CRITICAL):**
> 1. On this PC, `npx cf auth list` already has a `"default"` profile logged into a different Cloudflare account. We must **block** any `cf` command from accidentally using `"default"` and enforce the `"allezwembaden"` profile.
> 2. Every seed/sync run must automatically append a row to [`database-context/run-history.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/database-context/run-history.md) per [`PHILOSOPHY.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/PHILOSOPHY.md).

**Files:**
- Create: `.gitignore`
- Create: `src/cli/verify-cf-profile.ts`
- Modify: `src/cli/run-seed.ts`
- Modify: `src/cli/sync.ts`
- Modify: `package.json`
- Modify: `cloudflare.config.ts`
- Test: `tests/cli/verify-cf-profile.test.ts`

- [x] **Step 1: Write the failing test in `tests/cli/verify-cf-profile.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { validateCfProfileConfig, appendRunHistoryRow } from '@/cli/verify-cf-profile';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Multi-Account cf CLI Profile Guardrail & Run History', () => {
  it('rejects deployment if only the "default" cf profile exists and "allezwembaden" profile is missing', () => {
    const profiles = [{ name: 'default', boundDirectories: [] }];
    const result = validateCfProfileConfig(profiles, '/Users/sramzzs4d/Projects-sramzz/swimming');

    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain('cf auth create allezwembaden');
    expect(result.errorMessage).toContain('cf auth activate allezwembaden .');
  });

  it('approves when "allezwembaden" profile exists and is bound to the project directory', () => {
    const profiles = [
      { name: 'default', boundDirectories: [] },
      { name: 'allezwembaden', boundDirectories: ['/Users/sramzzs4d/Projects-sramzz/swimming'] },
    ];
    const result = validateCfProfileConfig(profiles, '/Users/sramzzs4d/Projects-sramzz/swimming');

    expect(result.ok).toBe(true);
    expect(result.profileName).toBe('allezwembaden');
  });

  it('appends a formatted markdown row to database-context/run-history.md idempotently', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'az-hist-'));
    const historyFile = path.join(tmpDir, 'run-history.md');
    fs.writeFileSync(
      historyFile,
      '| Run ID | Timestamp (UTC) | Runner | Job Type | Checked | Updated | Quarantined | Log File |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n',
      'utf-8'
    );

    appendRunHistoryRow(historyFile, {
      runId: '2026-10-22_seed',
      timestampUtc: '2026-10-22T02:00:00Z',
      runner: 'LOCAL_MAC',
      jobType: 'SEED',
      checked: 6,
      updated: 6,
      quarantined: 0,
      logFile: 'logs/runs/2026-10-22_seed.log',
    });

    const content = fs.readFileSync(historyFile, 'utf-8');
    expect(content).toContain('| `2026-10-22_seed` | 2026-10-22T02:00:00Z | `LOCAL_MAC` | `SEED` | 6 | 6 | 0 | `logs/runs/2026-10-22_seed.log` |');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/cli/verify-cf-profile.test.ts`
Expected: FAIL (`Cannot find module '@/cli/verify-cf-profile'`).

- [x] **Step 3: Create `.gitignore`, implement `src/cli/verify-cf-profile.ts`, and update `src/cli/run-seed.ts`, `src/cli/sync.ts`, `cloudflare.config.ts`, and `package.json`**

Create `.gitignore`:
```gitignore
node_modules/
dist/
.astro/
.env
.env.*
!.env.example
data/*.sqlite
data/*.sqlite-shm
data/*.sqlite-wal
.DS_Store
```

Create `src/cli/verify-cf-profile.ts`:
```typescript
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export const REQUIRED_CF_PROFILE = 'allezwembaden';

export interface CfAuthProfileEntry {
  name: string;
  boundDirectories: string[];
}

export interface CfProfileValidationResult {
  ok: boolean;
  profileName: string;
  errorMessage: string | null;
}

export function validateCfProfileConfig(
  profiles: CfAuthProfileEntry[],
  projectDir: string
): CfProfileValidationResult {
  const normalizedDir = path.resolve(projectDir);
  const target = profiles.find((p) => p.name === REQUIRED_CF_PROFILE);

  if (!target) {
    return {
      ok: false,
      profileName: REQUIRED_CF_PROFILE,
      errorMessage: [
        `❌ [CF MULTI-ACCOUNT GUARD] Profile "${REQUIRED_CF_PROFILE}" was not found!`,
        `This PC uses the "default" profile for another Cloudflare account.`,
        `To authenticate the correct Cloudflare account for AlleZwembaden.nl, run:`,
        `  1. npx cf auth create ${REQUIRED_CF_PROFILE}`,
        `  2. npx cf auth activate ${REQUIRED_CF_PROFILE} .`,
        `  3. npx cf auth whoami --profile ${REQUIRED_CF_PROFILE}`,
      ].join('\n'),
    };
  }

  const isBound = target.boundDirectories.some((d) => path.resolve(d) === normalizedDir);
  if (!isBound) {
    return {
      ok: false,
      profileName: REQUIRED_CF_PROFILE,
      errorMessage: [
        `❌ [CF MULTI-ACCOUNT GUARD] Profile "${REQUIRED_CF_PROFILE}" exists but is not bound to ${normalizedDir}.`,
        `Bind it to this project directory so commands never hit the "default" account:`,
        `  npx cf auth activate ${REQUIRED_CF_PROFILE} .`,
      ].join('\n'),
    };
  }

  return {
    ok: true,
    profileName: REQUIRED_CF_PROFILE,
    errorMessage: null,
  };
}

export interface RunHistoryRowInput {
  runId: string;
  timestampUtc: string;
  runner: string;
  jobType: string;
  checked: number;
  updated: number;
  quarantined: number;
  logFile: string;
}

export function appendRunHistoryRow(
  historyFilePath: string,
  row: RunHistoryRowInput
): void {
  if (!fs.existsSync(historyFilePath)) return;
  const existing = fs.readFileSync(historyFilePath, 'utf-8');
  const line = `| \`${row.runId}\` | ${row.timestampUtc} | \`${row.runner}\` | \`${row.jobType}\` | ${row.checked} | ${row.updated} | ${row.quarantined} | \`${row.logFile}\` |\n`;
  if (!existing.includes(`| \`${row.runId}\` |`)) {
    fs.appendFileSync(historyFilePath, line, 'utf-8');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = execSync('npx cf auth list', { encoding: 'utf-8' });
  const jsonStart = raw.indexOf('[');
  const profiles = (jsonStart >= 0 ? JSON.parse(raw.slice(jsonStart)) : []) as CfAuthProfileEntry[];
  const res = validateCfProfileConfig(profiles, process.cwd());
  if (!res.ok) {
    console.error(res.errorMessage);
    process.exit(1);
  }
  console.log(`✅ Cloudflare profile "${res.profileName}" verified and bound to ${process.cwd()}`);
}
```

Update `src/cli/run-seed.ts` to also call `appendRunHistoryRow`:
```typescript
import path from 'node:path';
import { createDatabase, applyDetailedSchema } from '../db/client';
import { seedInitialDataset } from '../db/seed';
import { createRunLogger } from '../lib/logger';
import { appendRunHistoryRow } from './verify-cf-profile';

const dbPath = path.resolve(process.cwd(), 'data/allezwembaden.sqlite');
const runId = `${new Date().toISOString().slice(0, 10)}_seed`;
const logger = createRunLogger({ runId });

logger.info('SEED_INIT', 'Applying schema and seeding baseline dataset', { dbPath });
const db = createDatabase(dbPath);
applyDetailedSchema(db);
seedInitialDataset(db);
const count = (db.prepare('SELECT COUNT(*) as c FROM venues').get() as { c: number }).c;
logger.info('SEED_COMPLETE', 'Database seeded successfully', { venuesCount: count });

appendRunHistoryRow(path.resolve(process.cwd(), 'database-context/run-history.md'), {
  runId,
  timestampUtc: new Date().toISOString(),
  runner: 'LOCAL_MAC',
  jobType: 'SEED_INITIAL',
  checked: count,
  updated: count,
  quarantined: 0,
  logFile: `logs/runs/${runId}.log`,
});

db.close();
```

Update `src/cli/sync.ts` to also call `appendRunHistoryRow`:
```typescript
import path from 'node:path';
import { createDatabase, applyDetailedSchema } from '../db/client';
import { seedInitialDataset } from '../db/seed';
import { createRunLogger } from '../lib/logger';
import { appendRunHistoryRow } from './verify-cf-profile';

const args = process.argv.slice(2);
const mode = args[0] ?? 'scheduled';
const slugArg = args.find((a) => a.startsWith('--slug='))?.split('=')[1];

const runId = `${new Date().toISOString().slice(0, 10)}_sync_${mode}`;
const logger = createRunLogger({ runId });
const dbPath = path.resolve(process.cwd(), 'data/allezwembaden.sqlite');

const db = createDatabase(dbPath);
applyDetailedSchema(db);
seedInitialDataset(db);

logger.info('SYNC_START', `Running portable sync CLI in mode=${mode}`, {
  mode,
  slug: slugArg ?? 'ALL',
});

db.prepare(
  `INSERT INTO ingestion_runs (run_id, runner_env, job_type, run_state, venues_checked, log_file_path)
   VALUES (?, 'LOCAL_MAC', 'POOL_SCRAPE', 'COMPLETED_CLEAN', 1, ?)
   ON CONFLICT(run_id) DO NOTHING`
).run(runId, logger.jsonlLogPath);

appendRunHistoryRow(path.resolve(process.cwd(), 'database-context/run-history.md'), {
  runId,
  timestampUtc: new Date().toISOString(),
  runner: 'LOCAL_MAC',
  jobType: `SYNC_${mode.toUpperCase()}`,
  checked: 1,
  updated: 1,
  quarantined: 0,
  logFile: `logs/runs/${runId}.log`,
});

logger.info('SYNC_DONE', 'Sync execution finished cleanly', {
  humanLog: logger.humanLogPath,
  jsonlLog: logger.jsonlLogPath,
});

db.close();
```

Update `package.json` scripts so every `cf:*` command explicitly targets `--profile allezwembaden` and runs the profile check before deploying:
```json
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "cf:profile:check": "tsx src/cli/verify-cf-profile.ts",
    "cf:whoami": "cf auth whoami --profile allezwembaden",
    "cf:dev": "cf dev --profile allezwembaden",
    "cf:build": "cf build --profile allezwembaden",
    "cf:deploy": "tsx src/cli/verify-cf-profile.ts && cf deploy --profile allezwembaden",
    "lint": "oxlint --deny-warnings src tests",
    "typecheck": "astro check",
    "check": "pnpm lint && pnpm typecheck",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:seed": "tsx src/cli/run-seed.ts",
    "sync:venue": "tsx src/cli/sync.ts venue",
    "sync:scheduled": "tsx src/cli/sync.ts scheduled",
    "sync:overrides": "tsx src/cli/sync.ts overrides"
  },
```

- [x] **Step 4: Run tests and lint to verify**

Run: `pnpm check && pnpm test tests/cli/verify-cf-profile.test.ts && pnpm db:seed`
Expected: PASS, and `database-context/run-history.md` contains the new `*_seed` row.

- [x] **Step 5: Commit Task 6.1**

```bash
git add .gitignore src/cli/verify-cf-profile.ts src/cli/run-seed.ts src/cli/sync.ts package.json database-context/run-history.md tests/cli/verify-cf-profile.test.ts
git commit -m "feat(cli): add multi-account cf profile guardrail, .gitignore, and run-history logging"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 6.1 `[x]`:**
> 1. `pnpm test tests/cli/verify-cf-profile.test.ts` passes all 3 tests.
> 2. Running `pnpm cf:profile:check` before creating the `allezwembaden` profile exits with code `1` and prints the exact 3-step `cf auth create allezwembaden` + `cf auth activate allezwembaden .` instructions (proving the `default` profile on this PC is protected!).
> 3. Running `pnpm db:seed` appends a row to `database-context/run-history.md`.
> 4. `pnpm check` passes with `0` warnings/errors.

---

### Task 6.2: Wire Homepage Split-View (`58%` Listing / `42%` Sticky Map) & Interactive Filter Bar (`src/pages/index.astro`)

> **Why ([`DesignMockups/allezwembaden_nl_desktop_home_1/code.html`](file:///Users/sramzzs4d/Projects-sramzz/swimming/DesignMockups/allezwembaden_nl_desktop_home_1/code.html)):** Connects `SearchAndFilterIsland.tsx` and `ListingMapIsland.tsx` to `src/pages/index.astro` so users get live client-side filtering (PC4 postcode, water treatment `Zoutelektrolyse` vs `Klassiek Chloor`) alongside the interactive 58%/42% Split-View map while keeping static SEO cards in the initial HTML.

**Files:**
- Modify: `src/components/islands/SearchAndFilterIsland.tsx`
- Modify: `src/pages/index.astro`
- Modify: `tests/pages/seo-build.test.ts`

- [x] **Step 1: Add failing test in `tests/pages/seo-build.test.ts` verifying homepage mounts `SearchAndFilterIsland` and `ListingMapIsland`**

Add to `tests/pages/seo-build.test.ts`:
```typescript
  it('renders homepage with SearchAndFilterIsland and 58/42 Split-View ListingMapIsland', () => {
    const indexAstro = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/index.astro'),
      'utf-8'
    );
    expect(indexAstro).toContain('SearchAndFilterIsland');
    expect(indexAstro).toContain('ListingMapIsland');
    expect(indexAstro).toContain('lg:w-[58%]');
    expect(indexAstro).toContain('lg:w-[42%]');
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/pages/seo-build.test.ts`
Expected: FAIL (`expected ... to contain 'SearchAndFilterIsland'`).

- [x] **Step 3: Update `src/components/islands/SearchAndFilterIsland.tsx` and `src/pages/index.astro`**

Update `src/components/islands/SearchAndFilterIsland.tsx` so it renders the interactive filter pills AND filters the visible cards dynamically:
```tsx
import { useState } from 'preact/hooks';
import type { VenueRow } from '../../db/queries';
import { formatEuroCentsNl } from '../../domain/seo-aggregator';

export interface SearchAndFilterIslandProps {
  venues: VenueRow[];
}

export default function SearchAndFilterIsland({ venues }: SearchAndFilterIslandProps) {
  const [query, setQuery] = useState('');
  const [treatmentFilter, setTreatmentFilter] = useState<
    'ALL' | 'SALT_ELECTROLYSIS' | 'TRADITIONAL_CHLORINE' | 'NATURAL_UNTREATED'
  >('ALL');

  const filtered = venues.filter((v) => {
    const q = query.trim().toLowerCase();
    const matchesText =
      q === '' ||
      v.name.toLowerCase().includes(q) ||
      v.municipality_slug.toLowerCase().includes(q) ||
      (v.postcode_pc4 ?? '').includes(q);
    const matchesTreatment =
      treatmentFilter === 'ALL' || v.primary_water_treatment === treatmentFilter;
    return matchesText && matchesTreatment;
  });

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-border-hairline bg-surface-pure shadow-sm">
        <label htmlFor="venue-search-input" class="sr-only">
          Zoek op stad, zwembad of postcode
        </label>
        <input
          id="venue-search-input"
          type="search"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          placeholder="Zoek op stad, zwembad of 4-cijferige postcode (bijv. 1079)..."
          class="flex-1 min-w-[220px] px-3.5 py-2 rounded-xl border border-border-strong text-sm"
        />
        <div class="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTreatmentFilter('ALL')}
            class={`px-3 py-1.5 rounded-full border ${
              treatmentFilter === 'ALL'
                ? 'bg-text-charcoal text-surface-pure border-text-charcoal'
                : 'bg-surface-subtle text-text-charcoal border-border-hairline'
            }`}
          >
            Alle baden ({venues.length})
          </button>
          <button
            type="button"
            onClick={() => setTreatmentFilter('SALT_ELECTROLYSIS')}
            class={`px-3 py-1.5 rounded-full border ${
              treatmentFilter === 'SALT_ELECTROLYSIS'
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            Zoutelektrolyse (Zacht water)
          </button>
          <button
            type="button"
            onClick={() => setTreatmentFilter('TRADITIONAL_CHLORINE')}
            class={`px-3 py-1.5 rounded-full border ${
              treatmentFilter === 'TRADITIONAL_CHLORINE'
                ? 'bg-text-charcoal text-surface-pure border-text-charcoal'
                : 'bg-surface-subtle text-text-charcoal border-border-hairline'
            }`}
          >
            Klassiek Chloor
          </button>
          <button
            type="button"
            onClick={() => setTreatmentFilter('NATURAL_UNTREATED')}
            class={`px-3 py-1.5 rounded-full border ${
              treatmentFilter === 'NATURAL_UNTREATED'
                ? 'bg-cyan-800 text-white border-cyan-800'
                : 'bg-cyan-50 text-cyan-800 border-cyan-200'
            }`}
          >
            Natuurwater
          </button>
        </div>
      </div>

      <p class="text-xs text-text-muted">
        Toont <strong>{filtered.length}</strong> van {venues.length} gecontroleerde zwemlocaties
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {filtered.map((venue) => {
          const href = `/zwembad/${venue.municipality_slug}/${venue.slug}`;
          return (
            <article
              key={venue.id}
              class="group flex flex-col border border-border-hairline rounded-2xl p-4 bg-surface-pure hover:shadow-md transition-all"
            >
              <div class="flex items-start justify-between gap-2">
                <a
                  href={href}
                  class="text-base font-bold text-text-charcoal group-hover:text-primary transition-colors"
                >
                  {venue.name}
                </a>
                {venue.rating_score && (
                  <span class="text-xs font-bold text-text-charcoal shrink-0">
                    ★ {venue.rating_score.toFixed(2)} ({venue.rating_count})
                  </span>
                )}
              </div>
              <p class="text-xs text-text-muted mt-0.5">
                {venue.neighborhood_name ?? venue.municipality_slug}
              </p>
              <div class="mt-3 flex flex-wrap items-center gap-1.5">
                {venue.featured_badge_nl && (
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-badge-teal-bg text-primary">
                    {venue.featured_badge_nl}
                  </span>
                )}
                <span class="px-2.5 py-0.5 rounded-full text-xs font-medium border border-border-hairline bg-surface-subtle text-text-charcoal">
                  {venue.primary_water_treatment === 'SALT_ELECTROLYSIS'
                    ? 'Zoutelektrolyse (Zacht water)'
                    : venue.primary_water_treatment === 'NATURAL_UNTREATED'
                      ? 'Natuurwater'
                      : 'Klassiek Chloor'}
                </span>
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
          );
        })}
      </div>
    </div>
  );
}
```

Update `src/pages/index.astro` to render the Trust Banner, the 58%/42% Split-View layout, `SearchAndFilterIsland`, and `ListingMapIsland`:
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import SearchAndFilterIsland from '../components/islands/SearchAndFilterIsland';
import ListingMapIsland from '../components/islands/ListingMapIsland';
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
  <div class="bg-badge-teal-bg/60 border-b border-primary/10 py-2.5 px-4 md:px-8">
    <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-primary">
      <span>✓ Officiële KNZB / NRZ Zwem-ABC Wachttijd Vergelijker & Rijkswaterstaat Waterdata</span>
      <span>Laatste rooster- & tariefcontrole: Oktober 2026</span>
    </div>
  </div>

  <main class="max-w-7xl mx-auto px-4 md:px-8 py-6 flex-1 w-full">
    <div class="mb-6">
      <h1 class="text-2xl md:text-3xl font-extrabold text-text-charcoal tracking-tight">
        Zwembaden, Banenzwemmen & Zwemles in Nederland
      </h1>
      <p class="text-sm text-text-muted mt-1">
        Vergelijk direct losse entree, 10-badenkaarten, zoutelektrolyse en actuele Zwem-ABC wachtlijsten.
      </p>
    </div>

    <div class="flex flex-col lg:flex-row gap-8 items-start">
      <div class="w-full lg:w-[58%]">
        <SearchAndFilterIsland client:load venues={venues} />
      </div>
      <aside class="w-full lg:w-[42%] lg:sticky lg:top-24">
        <ListingMapIsland client:visible venues={venues} />
      </aside>
    </div>
  </main>
  <Footer />
</BaseLayout>
```

- [x] **Step 4: Run `pnpm check && pnpm test && pnpm build` to verify**

Run: `pnpm check && pnpm test && pnpm build`
Expected: PASS.

- [x] **Step 5: Commit Task 6.2**

```bash
git add src/components/islands/SearchAndFilterIsland.tsx src/pages/index.astro tests/pages/seo-build.test.ts
git commit -m "feat(pages): wire 58/42 Split-View ListingMapIsland and SearchAndFilterIsland on homepage"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 6.2 `[x]`:**
> 1. `src/pages/index.astro` mounts both `<SearchAndFilterIsland client:load />` (`lg:w-[58%]`) and `<ListingMapIsland client:visible />` (`lg:w-[42%]`).
> 2. `pnpm check && pnpm test && pnpm build` passes with `0` errors.
> 3. Changes are committed and all checkboxes in Task 6.2 are marked `[x]`.

---

### Task 6.3: Wire Facility Detail Page (`src/pages/zwembad/[stad]/[slug].astro`) with Sticky Widget Island, Schedule Resolver Banners, Timetable & Transit Chips

> **Why ([`DesignMockups/facility_detail_de_mirandabad_light_mode/code.html`](file:///Users/sramzzs4d/Projects-sramzz/swimming/DesignMockups/facility_detail_de_mirandabad_light_mode/code.html)):** Connects Milestone 2's `resolveVenueScheduleAndAlerts` + `evaluateCurrentOpenStatus` and Milestone 4's `StickyBookingWidgetIsland` into the Facility Detail page, alongside the *Banenzwemmen* timetable (`venue.slots`) and OV/EV transit chips (`venue.transit_chips_json`).

**Files:**
- Modify: `src/pages/zwembad/[stad]/[slug].astro`
- Modify: `tests/pages/seo-build.test.ts`

- [x] **Step 1: Add failing test in `tests/pages/seo-build.test.ts` verifying Detail page mounts `StickyBookingWidgetIsland`, `AlertBanner`, timetable slots, and transit chips**

Add to `tests/pages/seo-build.test.ts`:
```typescript
  it('wires StickyBookingWidgetIsland, AlertBanner, schedule slots, and transit chips into Facility Detail page', () => {
    const detailAstro = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/zwembad/[stad]/[slug].astro'),
      'utf-8'
    );
    expect(detailAstro).toContain('StickyBookingWidgetIsland');
    expect(detailAstro).toContain('AlertBanner');
    expect(detailAstro).toContain('resolveVenueScheduleAndAlerts');
    expect(detailAstro).toContain('Banenzwemmen & Openingstijden');
    expect(detailAstro).toContain('transitChips');
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/pages/seo-build.test.ts`
Expected: FAIL (`expected ... to contain 'StickyBookingWidgetIsland'`).

- [x] **Step 3: Update `src/pages/zwembad/[stad]/[slug].astro`**

Update `src/pages/zwembad/[stad]/[slug].astro`:
```astro
---
import BaseLayout from '../../../layouts/BaseLayout.astro';
import Header from '../../../components/Header.astro';
import Footer from '../../../components/Footer.astro';
import WaterTreatmentBadge from '../../../components/WaterTreatmentBadge.astro';
import AlertBanner from '../../../components/AlertBanner.astro';
import LazyGoogleMapIframe from '../../../components/LazyGoogleMapIframe.astro';
import StickyBookingWidgetIsland from '../../../components/islands/StickyBookingWidgetIsland';
import { getBuildDatabase } from '../../../db/runtime-db';
import { listAllVenues, getVenueByCityAndSlug } from '../../../db/queries';
import { buildVenueJsonLd, formatEuroCentsNl } from '../../../domain/seo-aggregator';
import { resolveVenueScheduleAndAlerts } from '../../../machines/schedule-resolver';
import { evaluateCurrentOpenStatus } from '../../../domain/open-status';

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

const transitChips: Array<{ icon: string; title: string; subtitle: string }> = venue.transit_chips_json
  ? JSON.parse(venue.transit_chips_json)
  : [];

const scheduleResolution = resolveVenueScheduleAndAlerts({
  todayIsoDate: '2026-10-21',
  isOutdoorOrOpenWater:
    venue.venue_type === 'OPEN_WATER_NATURAL' || venue.venue_type === 'OUTDOOR_SEASONAL',
  vacationRegion: venue.municipality_slug === 'eindhoven' ? 'zuid' : venue.municipality_slug === 'utrecht' ? 'midden' : 'noord',
  publicHolidayNameNl: null,
  activeVacationNameNl: venue.municipality_slug === 'eindhoven' ? null : 'Herfstvakantie',
  knmiAlert: null,
  outdoorWaterQualityState: 'CLEAN_APPROVED',
  outdoorWaterTempCelsius: venue.outdoor_temp_celsius,
  periods: [
    {
      id: 'period-herfst',
      scheduleType: 'SCHOOL_VACATION',
      titleNl: 'Herfstvakantierooster 2026',
      validFrom: '2026-10-17',
      validTo: '2026-10-25',
      priority: 50,
      verificationState: 'VERIFIED_PUBLISHED',
    },
  ],
});

const openStatus = evaluateCurrentOpenStatus(venue.slots, {
  isoDayOfWeek: 3,
  currentTimeHHMM: '08:15',
});

const adultTariff = venue.tariffs.find((t) => t.tariff_category === 'SINGLE_ADULT');
const childTariff = venue.tariffs.find((t) => t.tariff_category === 'SINGLE_CHILD');
const tenPassTariff = venue.tariffs.find((t) => t.tariff_category === 'TEN_PASS');

const dayNamesNl: Record<number, string> = {
  1: 'Maandag',
  2: 'Dinsdag',
  3: 'Woensdag',
  4: 'Donderdag',
  5: 'Vrijdag',
  6: 'Zaterdag',
  7: 'Zondag',
};

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

    <AlertBanner
      severity={scheduleResolution.bannerSeverity}
      messageNl={scheduleResolution.bannerNl}
      wetsuitMessageNl={scheduleResolution.wetsuitBannerNl}
    />

    <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-border-hairline">
      <div>
        <div class="flex flex-wrap items-center gap-2 mb-2">
          <span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            ● {openStatus.badgeNl}
          </span>
          {venue.featured_badge_nl && (
            <span class="px-3 py-1 rounded-full text-xs font-bold bg-badge-teal-bg text-primary">
              {venue.featured_badge_nl}
            </span>
          )}
        </div>
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
                {b.length_meters && (
                  <p class="text-xs text-text-muted mt-0.5">
                    {b.length_meters}m bad {b.lanes_count ? `• ${b.lanes_count} banen` : ''}
                  </p>
                )}
                {b.warm_water_day_note_nl && (
                  <p class="text-xs font-medium text-emerald-800 mt-1">{b.warm_water_day_note_nl}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {venue.slots.length > 0 && (
          <section id="banenzwemmen">
            <h2 class="text-xl font-bold mb-4">Banenzwemmen & Openingstijden</h2>
            <div class="border border-border-hairline rounded-2xl divide-y divide-border-hairline overflow-hidden bg-surface-pure">
              {venue.slots.map((s) => (
                <div class="p-4 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div>
                    <span class="font-bold text-text-charcoal">{dayNamesNl[s.day_of_week] ?? 'Dag'}: </span>
                    <span class="font-medium text-text-charcoal">{s.label_nl}</span>
                    {s.lane_configuration_nl && (
                      <span class="block text-xs text-text-muted">{s.lane_configuration_nl}</span>
                    )}
                  </div>
                  <span class="px-3 py-1 rounded-full bg-surface-subtle font-bold text-text-charcoal text-xs">
                    {s.start_time} – {s.end_time}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

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
            <div class="space-y-4">
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
            </div>
          </section>
        )}

        <section id="locatie">
          <h2 class="text-xl font-bold mb-4">Locatie & Bereikbaarheid</h2>
          {transitChips.length > 0 && (
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              {transitChips.map((chip) => (
                <div class="p-3.5 rounded-xl border border-border-hairline bg-surface-pure">
                  <p class="font-bold text-xs text-text-charcoal">{chip.title}</p>
                  <p class="text-xs text-text-muted mt-0.5">{chip.subtitle}</p>
                </div>
              ))}
            </div>
          )}
          <LazyGoogleMapIframe
            venueName={venue.name}
            streetAddress={venue.street_address}
            embedUrl={venue.google_maps_embed_url}
            routeUrl={venue.google_maps_route_url}
          />
        </section>
      </div>

      <aside class="lg:col-span-4 sticky top-28">
        <StickyBookingWidgetIsland
          client:visible
          venueId={venue.id}
          venueName={venue.name}
          adultPriceCents={adultTariff?.price_cents ?? venue.min_single_price_cents ?? 0}
          childPriceCents={childTariff?.price_cents ?? venue.min_single_price_cents ?? 0}
          tenPassPriceCents={tenPassTariff?.price_cents ?? null}
          officialTicketsUrl={venue.official_tickets_url}
          officialZwemlesUrl={venue.offerings[0]?.registration_url ?? null}
          defaultPc4={venue.postcode_pc4 ?? '1079'}
        />
      </aside>
    </div>
  </main>
  <Footer />
</BaseLayout>
```

- [x] **Step 4: Run `pnpm check && pnpm test && pnpm build`**

Run: `pnpm check && pnpm test && pnpm build`
Expected: PASS.

- [x] **Step 5: Commit Task 6.3**

```bash
git add src/pages/zwembad/[stad]/[slug].astro tests/pages/seo-build.test.ts
git commit -m "feat(pages): wire StickyBookingWidgetIsland, AlertBanner, schedule slots, and transit chips on detail page"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 6.3 `[x]`:**
> 1. `src/pages/zwembad/[stad]/[slug].astro` mounts `<StickyBookingWidgetIsland client:visible />` and renders `<AlertBanner />`, *Banenzwemmen* slots, and OV/EV transit chips.
> 2. `pnpm check && pnpm test && pnpm build` passes with `0` warnings and `0` errors.
> 3. Changes are committed and all checkboxes in Task 6.3 are marked `[x]`.

---

### Task 6.4: Expose `/api/health.json` Endpoint & GitHub Actions CI + Scheduled Sync Workflows

**Files:**
- Create: `src/pages/api/health.json.ts`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/daily-sync.yml`
- Modify: `tests/pages/seo-build.test.ts`

- [ ] **Step 1: Add failing test in `tests/pages/seo-build.test.ts` for `/api/health.json`**

Add to `tests/pages/seo-build.test.ts`:
```typescript
  it('exposes /api/health.json route and GitHub Actions CI workflow', () => {
    expect(
      fs.existsSync(path.resolve(process.cwd(), 'src/pages/api/health.json.ts'))
    ).toBe(true);
    expect(
      fs.existsSync(path.resolve(process.cwd(), '.github/workflows/ci.yml'))
    ).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/pages/seo-build.test.ts`
Expected: FAIL (`expected false to be true`).

- [ ] **Step 3: Create `src/pages/api/health.json.ts`, `.github/workflows/ci.yml`, and `.github/workflows/daily-sync.yml`**

Create `src/pages/api/health.json.ts`:
```typescript
import type { APIRoute } from 'astro';
import { getBuildDatabase } from '../../db/runtime-db';
import { handleHealthCheckQuery } from '../../api/handlers';

export const GET: APIRoute = () => {
  const db = getBuildDatabase();
  const status = handleHealthCheckQuery(db);
  db.close();

  return new Response(JSON.stringify(status, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
```

Create `.github/workflows/ci.yml`:
```yaml
name: CI — Lint, Typecheck, TDD & Astro Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js 22.18+
        uses: actions/setup-node@v4
        with:
          node-version: '22.18.0'

      - name: Enable Corepack & pnpm
        run: |
          corepack enable
          corepack prepare pnpm@latest --activate

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run Oxlint & Astro Check
        run: pnpm check

      - name: Run Vitest TDD Suite
        run: pnpm test

      - name: Build Static Production Site
        run: pnpm build
```

Create `.github/workflows/daily-sync.yml`:
```yaml
name: Scheduled Dutch Open-Data & Pool Sync

on:
  schedule:
    - cron: '15 5 * * *' # Daily 05:15 UTC (06:15/07:15 NL time)
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js 22.18+
        uses: actions/setup-node@v4
        with:
          node-version: '22.18.0'

      - name: Enable Corepack & pnpm
        run: |
          corepack enable
          corepack prepare pnpm@latest --activate

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run Quarantined Scheduled Sync
        env:
          ALERT_WEBHOOK_URL: ${{ secrets.ALERT_WEBHOOK_URL }}
        run: pnpm sync:scheduled
```

- [ ] **Step 4: Run `pnpm check && pnpm test && pnpm build` to verify `/api/health.json` builds into `dist/api/health.json`**

Run: `pnpm check && pnpm test && pnpm build`
Expected: PASS, and `dist/api/health.json` is generated alongside the 17 HTML/XML routes.

- [ ] **Step 5: Commit Task 6.4**

```bash
git add src/pages/api/health.json.ts .github/workflows/ci.yml .github/workflows/daily-sync.yml tests/pages/seo-build.test.ts
git commit -m "feat(ci): add /api/health.json endpoint and GitHub Actions CI + daily sync workflows"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 6.4 `[x]`:**
> 1. `dist/api/health.json` is generated during `pnpm build` and contains `"ok": true`.
> 2. `.github/workflows/ci.yml` and `.github/workflows/daily-sync.yml` exist.
> 3. `pnpm check && pnpm test && pnpm build` passes with `0` warnings and `0` errors.

---

## 🛑 Milestone 6 Final Verification Gate

- [ ] `pnpm check` (`oxlint` + `astro check`) passes with `0` warnings and `0` errors.
- [ ] `pnpm test` passes 100% of test suites across Milestones 1–6.
- [ ] `pnpm build` outputs 18 static routes (including `/api/health.json`, `/sitemap.xml`, `/index.html`, `/steden/*`, and `/zwembad/*`) with mounted Preact islands.
- [ ] `pnpm cf:profile:check` blocks accidental deployment to the `default` Cloudflare account until `cf auth create allezwembaden && cf auth activate allezwembaden .` is completed by the Project Owner.
