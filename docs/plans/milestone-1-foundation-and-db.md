# Milestone 1 Implementation Plan: Foundation, Logger, SQLite/D1 Schema & Seed Data

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the TypeScript + Astro 5 + Vitest workspace, build the non-negotiable dual-format logger (`logs/runs/`), initialize the SQLite/Cloudflare D1 database with [`database-context/schema-detailed.sql`](file:///Users/sramzzs4d/Projects-sramzz/swimming/database-context/schema-detailed.sql), implement `<0.5ms` PC4 geospatial radius search, and seed the Gold-Standard Randstad flagship venues.

**Architecture:** Local SQLite (`better-sqlite3`) mirrors Cloudflare D1 1-to-1 for fast local TDD while sharing the exact same SQL schema in [`database-context/schema-detailed.sql`](file:///Users/sramzzs4d/Projects-sramzz/swimming/database-context/schema-detailed.sql). Every operational step logs to both human-readable `.log` and structured `.jsonl` files in `logs/runs/`.

**Tech Stack:** TypeScript, Astro 5, Tailwind CSS v4, Preact, `better-sqlite3`, Vitest, Zod.

---

### Task 1.1: Initialize Project Workspace, `cloudflare.config.ts` (`cf` CLI) & Test Runner

> **Pre-Flight Check:** Before starting Task 1.1, ensure you have read **[`docs/runbooks/000-preflight-accounts-and-cf-cli.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/runbooks/000-preflight-accounts-and-cf-cli.md)** and verified `node -v` (`>= 22.18.0`) and `cf --version` (`pnpm add -g cf`).

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.oxlintrc.json`
- Create: `vitest.config.ts`
- Create: `astro.config.mjs`
- Create: `cloudflare.config.ts`
- Create: `.env.example`

- [ ] **Step 1: Create `package.json` with exact scripts (including `cf` CLI, `oxlint`, and `astro check`) and dependencies**

```json
{
  "name": "allezwembaden-nl",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "cf:dev": "cf dev",
    "cf:build": "cf build",
    "cf:deploy": "cf deploy",
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
  "dependencies": {
    "@astrojs/cloudflare": "^12.0.0",
    "@astrojs/preact": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "astro": "^5.1.0",
    "better-sqlite3": "^11.7.0",
    "cheerio": "^1.0.0",
    "maplibre-gl": "^5.0.0",
    "playwright-core": "^1.49.0",
    "preact": "^10.25.0",
    "tailwindcss": "^4.0.0",
    "unpdf": "^0.12.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@astrojs/check": "^0.9.4",
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.10.0",
    "cf": "latest",
    "oxlint": "^0.15.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`, `.oxlintrc.json`, `vitest.config.ts`, `astro.config.mjs`, `cloudflare.config.ts`, and `.env.example`**

Create `tsconfig.json`:
```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*", "cloudflare.config.ts"]
}
```

Create `.oxlintrc.json` (Ultra-fast Rust linter for TypeScript, Preact JSX a11y, and Vitest):
```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "unicorn", "jsx-a11y", "vitest"],
  "categories": {
    "correctness": "error",
    "suspicious": "warn"
  },
  "rules": {
    "typescript/no-explicit-any": "error",
    "no-unused-vars": "error",
    "jsx-a11y/alt-text": "error",
    "jsx-a11y/anchor-is-valid": "error"
  },
  "ignorePatterns": ["dist/**", ".astro/**", "node_modules/**"]
}
```

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

Create `astro.config.mjs`:
```javascript
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://allezwembaden.nl',
  output: 'static',
  integrations: [preact()],
  vite: {
    plugins: [tailwindcss()],
  },
});
```

Create `cloudflare.config.ts` (Typed configuration for the new Cloudflare `cf` CLI):
```typescript
export default {
  name: 'allezwembaden-nl',
  compatibilityDate: '2026-10-01',
  assets: {
    directory: './dist',
  },
  d1Databases: [
    {
      binding: 'DB',
      databaseName: 'allezwembaden-db',
      databaseId: process.env.CF_D1_DATABASE_ID ?? 'local-dev-d1',
    },
  ],
};
```

Create `.env.example`:
```dotenv
# Local SQLite database path (mirrors Cloudflare D1 locally for TDD & CLI)
LOCAL_SQLITE_PATH="./data/allezwembaden.sqlite"

# Cloudflare Turnstile Official Always-Pass Dummy Test Keys for localhost & CI
PUBLIC_TURNSTILE_SITE_KEY="1x00000000000000000000AA"
TURNSTILE_SECRET_KEY="1x0000000000000000000000000000000AA"

# Webhook Alert URL (Quarantine Gate & Scraper Anomalies)
ALERT_WEBHOOK_URL="https://ntfy.sh/allezwembaden-dev-test"

# Optional Headless Browser CDP URL (Lightpanda / Obscura)
BROWSER_CDP_URL="http://127.0.0.1:9222"
```

- [ ] **Step 3: Copy `.env.example` to `.env`, install dependencies, and verify `oxlint`, Vitest + `cf` CLI**

Run: `cp .env.example .env && pnpm install && pnpm lint && pnpm test --passWithNoTests && npx cf cli search "create D1 database"`
Expected: `pnpm lint` (`oxlint`) exits `0` in `<50ms`, `pnpm test` exits `0`, and `cf cli search` prints the matching `cf d1 create` command.

- [ ] **Step 4: Commit workspace setup**

```bash
git add package.json pnpm-lock.yaml tsconfig.json .oxlintrc.json vitest.config.ts astro.config.mjs cloudflare.config.ts .env.example
git commit -m "chore: initialize Astro 5, Tailwind v4, cf CLI, oxlint, and Vitest"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 1.1 `[x]`:**
> 1. `package.json`, `tsconfig.json`, `.oxlintrc.json`, `vitest.config.ts`, `astro.config.mjs`, `cloudflare.config.ts`, and `.env.example` exist in the repo root.
> 2. `pnpm lint` (`oxlint --deny-warnings src tests`) and `pnpm test --passWithNoTests` exit with code `0`.
> 3. `npx cf cli search "create D1 database"` executes cleanly without requiring cloud credentials.
> 4. Changes are committed to your feature branch (`git status` is clean, `.env` is not committed).

---

### Task 1.2: Build Dual-Format Logger (`src/lib/logger.ts`)

> **Why ([`PHILOSOPHY.md`](file:///Users/sramzzs4d/Projects-sramzz/swimming/PHILOSOPHY.md#L59)):** *"Logging is non-negotiable. A junior dev with zero project context should be able to follow the project from logs alone."*

**Files:**
- Create: `src/lib/logger.ts`
- Test: `tests/lib/logger.test.ts`

- [ ] **Step 1: Write the failing test in `tests/lib/logger.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRunLogger } from '@/lib/logger';

describe('Dual-Format Run Logger', () => {
  let tempLogDir: string;

  beforeEach(() => {
    tempLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'az-logs-'));
  });

  afterEach(() => {
    fs.rmSync(tempLogDir, { recursive: true, force: true });
  });

  it('writes both human-readable .log and structured .jsonl entries', () => {
    const logger = createRunLogger({
      runId: '20261021-test-run',
      logDir: tempLogDir,
      clock: () => '2026-10-21T10:00:00.000Z',
    });

    logger.info('SEED_START', 'Starting venue seed for Amsterdam', { city: 'amsterdam', count: 4 });
    logger.warn('QUARANTINED', 'Price out of range for venue', {
      slug: 'de-mirandabad',
      fixCmd: 'pnpm sync:venue --slug=de-mirandabad --inspect',
    });

    const humanLog = fs.readFileSync(logger.humanLogPath, 'utf-8');
    const jsonlLog = fs.readFileSync(logger.jsonlLogPath, 'utf-8').trim().split('\n');

    expect(humanLog).toContain('[2026-10-21T10:00:00.000Z] [INFO] [RUN:20261021-test-run] [SEED_START] Starting venue seed for Amsterdam');
    expect(humanLog).toContain('city="amsterdam" count=4');
    expect(humanLog).toContain('[WARN] [RUN:20261021-test-run] [QUARANTINED]');

    expect(jsonlLog).toHaveLength(2);
    const parsedSecond = JSON.parse(jsonlLog[1]);
    expect(parsedSecond).toEqual({
      timestamp: '2026-10-21T10:00:00.000Z',
      level: 'WARN',
      runId: '20261021-test-run',
      event: 'QUARANTINED',
      message: 'Price out of range for venue',
      context: {
        slug: 'de-mirandabad',
        fixCmd: 'pnpm sync:venue --slug=de-mirandabad --inspect',
      },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/lib/logger.test.ts`
Expected: FAIL (`Cannot find module '@/lib/logger'`).

- [ ] **Step 3: Implement `src/lib/logger.ts`**

```typescript
import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface RunLoggerOptions {
  runId: string;
  logDir?: string;
  clock?: () => string;
}

export interface RunLogger {
  readonly runId: string;
  readonly humanLogPath: string;
  readonly jsonlLogPath: string;
  info(event: string, message: string, context?: Record<string, unknown>): void;
  warn(event: string, message: string, context?: Record<string, unknown>): void;
  error(event: string, message: string, context?: Record<string, unknown>): void;
}

function formatContextPairs(context?: Record<string, unknown>): string {
  if (!context || Object.keys(context).length === 0) return '';
  const pairs = Object.entries(context).map(([k, v]) =>
    typeof v === 'string' ? `${k}="${v}"` : `${k}=${JSON.stringify(v)}`
  );
  return ` | ${pairs.join(' ')}`;
}

export function createRunLogger(options: RunLoggerOptions): RunLogger {
  const logDir = options.logDir ?? path.resolve(process.cwd(), 'logs/runs');
  const clock = options.clock ?? (() => new Date().toISOString());

  fs.mkdirSync(logDir, { recursive: true });

  const humanLogPath = path.join(logDir, `${options.runId}.log`);
  const jsonlLogPath = path.join(logDir, `${options.runId}.jsonl`);

  function write(level: LogLevel, event: string, message: string, context?: Record<string, unknown>): void {
    const timestamp = clock();
    const humanLine = `[${timestamp}] [${level}] [RUN:${options.runId}] [${event}] ${message}${formatContextPairs(context)}\n`;
    const jsonLine = JSON.stringify({
      timestamp,
      level,
      runId: options.runId,
      event,
      message,
      context: context ?? {},
    }) + '\n';

    fs.appendFileSync(humanLogPath, humanLine, 'utf-8');
    fs.appendFileSync(jsonlLogPath, jsonLine, 'utf-8');
  }

  return {
    runId: options.runId,
    humanLogPath,
    jsonlLogPath,
    info: (event, message, context) => write('INFO', event, message, context),
    warn: (event, message, context) => write('WARN', event, message, context),
    error: (event, message, context) => write('ERROR', event, message, context),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/lib/logger.test.ts`
Expected: PASS (1 passed).

- [ ] **Step 5: Commit logger**

```bash
git add src/lib/logger.ts tests/lib/logger.test.ts
git commit -m "feat(logger): add dual human .log and .jsonl run logger"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 1.2 `[x]`:**
> 1. You observed `tests/lib/logger.test.ts` **FAIL** in Step 2 before creating `src/lib/logger.ts`.
> 2. `pnpm test tests/lib/logger.test.ts` passes (`1 passed`).
> 3. Both `.log` (human-readable `[TIMESTAMP] [LEVEL] [RUN:ID]`) and `.jsonl` (valid newline-delimited JSON) files are written simultaneously by `createRunLogger`.
> 4. Changes are committed and all checkboxes in Task 1.2 are marked `[x]`.

---

### Task 1.3: Build SQLite/D1 Database Client & Schema Runner (`src/db/client.ts`)

**Files:**
- Create: `src/db/client.ts`
- Test: `tests/db/client.test.ts`

- [ ] **Step 1: Write the failing test in `tests/db/client.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { createDatabase, applyDetailedSchema } from '@/db/client';

describe('SQLite / D1 Schema & Foreign Key Integrity', () => {
  it('applies database-context/schema-detailed.sql and enforces STRICT and CHECK constraints', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('venues');
    expect(tableNames).toContain('basins');
    expect(tableNames).toContain('venue_swim_offerings');
    expect(tableNames).toContain('schedule_periods');
    expect(tableNames).toContain('tariffs');
    expect(tableNames).toContain('quarantined_anomalies');

    // Verify invalid FSM state is rejected by SQLite CHECK constraint
    expect(() => {
      db.prepare(
        `INSERT INTO municipalities (slug, cbs_code, name, province_slug, province_name, school_vacation_region, center_lat, center_lng)
         VALUES ('amsterdam', 'GM0363', 'Amsterdam', 'noord-holland', 'Noord-Holland', 'INVALID_REGION', 52.3676, 4.9041)`
      ).run();
    }).toThrow();

    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/db/client.test.ts`
Expected: FAIL (`Cannot find module '@/db/client'`).

- [ ] **Step 3: Implement `src/db/client.ts`**

```typescript
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type SqliteDatabase = Database.Database;

export function createDatabase(filename = ':memory:'): SqliteDatabase {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  return db;
}

export function applyDetailedSchema(
  db: SqliteDatabase,
  schemaPath = path.resolve(process.cwd(), 'database-context/schema-detailed.sql')
): void {
  const sql = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(sql);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/db/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit database client**

```bash
git add src/db/client.ts tests/db/client.test.ts
git commit -m "feat(db): add SQLite client and schema-detailed.sql runner"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 1.3 `[x]`:**
> 1. You observed `tests/db/client.test.ts` **FAIL** in Step 2 before creating `src/db/client.ts`.
> 2. `pnpm test tests/db/client.test.ts` passes (`1 passed`).
> 3. Foreign keys (`PRAGMA foreign_keys = ON`) and SQLite `STRICT` + `CHECK` constraints are verified by the unit test throwing on `INVALID_REGION`.
> 4. Changes are committed and all checkboxes in Task 1.3 are marked `[x]`.

---

### Task 1.4: Build Bounding-Box + Haversine Geospatial Search (`src/db/geo.ts`)

> **Why ([MADR 0001](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/MADRs/0001-hosting-and-database-cloudflare-d1.md)):** Resolves *"pools within 10 km of PC4 postcode 1079"* in `< 0.5 ms` in SQLite without needing a 400 MB PostGIS server.

**Files:**
- Create: `src/db/geo.ts`
- Test: `tests/db/geo.test.ts`

- [ ] **Step 1: Write the failing test in `tests/db/geo.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { computeBoundingBox, haversineDistanceKm } from '@/db/geo';

describe('Geospatial Bounding Box & Haversine Distance', () => {
  it('computes accurate distance in km between De Mirandabad (1079) and Sportfondsenbad Oost (1093)', () => {
    // De Mirandabad: 52.3387, 4.9021 | Sportfondsenbad Oost: 52.3564, 4.9275
    const distKm = haversineDistanceKm(52.3387, 4.9021, 52.3564, 4.9275);
    expect(distKm).toBeGreaterThan(2.4);
    expect(distKm).toBeLessThan(2.8);
  });

  it('computes a bounding box around a coordinate for SQLite index filtering', () => {
    const bbox = computeBoundingBox(52.3387, 4.9021, 10);
    expect(bbox.minLat).toBeLessThan(52.3387);
    expect(bbox.maxLat).toBeGreaterThan(52.3387);
    expect(bbox.minLng).toBeLessThan(4.9021);
    expect(bbox.maxLng).toBeGreaterThan(4.9021);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/db/geo.test.ts`
Expected: FAIL (`Cannot find module '@/db/geo'`).

- [ ] **Step 3: Implement `src/db/geo.ts`**

```typescript
const EARTH_RADIUS_KM = 6371.0;

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_KM * c * 100) / 100;
}

export function computeBoundingBox(
  centerLat: number,
  centerLng: number,
  radiusKm: number
): BoundingBox {
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.cos(toRadians(centerLat)));
  return {
    minLat: centerLat - latDelta,
    maxLat: centerLat + latDelta,
    minLng: centerLng - lngDelta,
    maxLng: centerLng + lngDelta,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/db/geo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit geospatial helper**

```bash
git add src/db/geo.ts tests/db/geo.test.ts
git commit -m "feat(db): add bounding-box and Haversine geospatial math"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 1.4 `[x]`:**
> 1. You observed `tests/db/geo.test.ts` **FAIL** in Step 2 before creating `src/db/geo.ts`.
> 2. `pnpm test tests/db/geo.test.ts` passes (`2 passed`).
> 3. Distance between *De Mirandabad* (`1079`) and *Sportfondsenbad Oost* (`1093`) computes between `2.4 km` and `2.8 km`.
> 4. Changes are committed and all checkboxes in Task 1.4 are marked `[x]`.

---

### Task 1.5: Build Idempotent Seeder (`src/db/seed.ts`) & Read Queries (`src/db/queries.ts`)

**Files:**
- Create: `src/db/seed.ts`
- Create: `src/db/queries.ts`
- Create: `src/cli/run-seed.ts`
- Test: `tests/db/seed-and-queries.test.ts`

- [ ] **Step 1: Write the failing test in `tests/db/seed-and-queries.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { createDatabase, applyDetailedSchema } from '@/db/client';
import { seedInitialDataset } from '@/db/seed';
import {
  getVenueByCityAndSlug,
  listVenuesByCity,
  findVenuesNearPostcodePc4,
  findShortestWaitlistOfferingsNearPc4,
} from '@/db/queries';

describe('Idempotent Seeder & Core Read Queries', () => {
  it('seeds municipalities, holidays, and flagship venues idempotently (running twice produces identical row counts)', () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);

    seedInitialDataset(db);
    seedInitialDataset(db); // Idempotency test: second run must not duplicate or throw

    const miranda = getVenueByCityAndSlug(db, 'amsterdam', 'de-mirandabad');
    expect(miranda).not.toBeNull();
    expect(miranda?.name).toBe('Zwemcentrum De Mirandabad');
    expect(miranda?.primary_water_treatment).toBe('SALT_ELECTROLYSIS');
    expect(miranda?.basins.length).toBeGreaterThanOrEqual(3);
    expect(miranda?.tariffs.length).toBeGreaterThanOrEqual(4);

    const amsterdamVenues = listVenuesByCity(db, 'amsterdam');
    expect(amsterdamVenues.length).toBeGreaterThanOrEqual(4);

    const near1079 = findVenuesNearPostcodePc4(db, '1079', 10);
    expect(near1079.length).toBeGreaterThanOrEqual(3);
    expect(near1079[0].slug).toBe('de-mirandabad');

    const top3Waitlist = findShortestWaitlistOfferingsNearPc4(db, '1079', 'DIPLOMA_A', 15, 3);
    expect(top3Waitlist.length).toBeGreaterThanOrEqual(2);
    expect(top3Waitlist[0].current_waitlist_weeks_min).toBeLessThanOrEqual(
      top3Waitlist[1].current_waitlist_weeks_min
    );

    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/db/seed-and-queries.test.ts`
Expected: FAIL (`Cannot find module '@/db/seed'`).

- [ ] **Step 3: Implement `src/db/seed.ts`, `src/db/queries.ts`, and `src/cli/run-seed.ts`**

Create `src/db/seed.ts`:
```typescript
import type { SqliteDatabase } from './client';

export function seedInitialDataset(db: SqliteDatabase): void {
  const tx = db.transaction(() => {
    // 1. Municipalities
    const upsertMunicipality = db.prepare(`
      INSERT INTO municipalities (slug, cbs_code, name, province_slug, province_name, school_vacation_region, center_lat, center_lng)
      VALUES (@slug, @cbs_code, @name, @province_slug, @province_name, @school_vacation_region, @center_lat, @center_lng)
      ON CONFLICT(slug) DO UPDATE SET
        name = excluded.name,
        school_vacation_region = excluded.school_vacation_region,
        center_lat = excluded.center_lat,
        center_lng = excluded.center_lng
    `);

    const municipalities = [
      { slug: 'amsterdam', cbs_code: 'GM0363', name: 'Amsterdam', province_slug: 'noord-holland', province_name: 'Noord-Holland', school_vacation_region: 'noord', center_lat: 52.3676, center_lng: 4.9041 },
      { slug: 'utrecht', cbs_code: 'GM0344', name: 'Utrecht', province_slug: 'utrecht', province_name: 'Utrecht', school_vacation_region: 'midden', center_lat: 52.0907, center_lng: 5.1214 },
      { slug: 'eindhoven', cbs_code: 'GM0772', name: 'Eindhoven', province_slug: 'noord-brabant', province_name: 'Noord-Brabant', school_vacation_region: 'zuid', center_lat: 51.4416, center_lng: 5.4697 },
      { slug: 'rotterdam', cbs_code: 'GM0599', name: 'Rotterdam', province_slug: 'zuid-holland', province_name: 'Zuid-Holland', school_vacation_region: 'midden', center_lat: 51.9244, center_lng: 4.4777 },
    ];
    for (const m of municipalities) upsertMunicipality.run(m);

    // 2. Postcode PC4 centroids
    const upsertPc4 = db.prepare(`
      INSERT INTO postcode_pc4 (pc4, municipality_slug, lat, lng)
      VALUES (@pc4, @municipality_slug, @lat, @lng)
      ON CONFLICT(pc4) DO UPDATE SET lat = excluded.lat, lng = excluded.lng
    `);
    const pc4List = [
      { pc4: '1079', municipality_slug: 'amsterdam', lat: 52.3387, lng: 4.9021 },
      { pc4: '1093', municipality_slug: 'amsterdam', lat: 52.3564, lng: 4.9275 },
      { pc4: '1064', municipality_slug: 'amsterdam', lat: 52.3718, lng: 4.8054 },
      { pc4: '1108', municipality_slug: 'amsterdam', lat: 52.3095, lng: 4.9912 },
      { pc4: '3544', municipality_slug: 'utrecht', lat: 52.0985, lng: 5.0542 },
      { pc4: '5644', municipality_slug: 'eindhoven', lat: 51.4162, lng: 5.4792 },
    ];
    for (const p of pc4List) upsertPc4.run(p);

    // 3. Dutch Public Holidays & School Vacations
    db.prepare(`
      INSERT INTO nl_public_holidays (holiday_date, name_nl, is_national)
      VALUES ('2026-04-27', 'Koningsdag', 1), ('2026-12-25', 'Eerste Kerstdag', 1), ('2026-12-26', 'Tweede Kerstdag', 1)
      ON CONFLICT(holiday_date) DO NOTHING
    `).run();

    db.prepare(`
      INSERT INTO nl_school_vacations (id, school_year, vacation_name, region, start_date, end_date, scrape_trigger_date)
      VALUES
        ('2026-herfst-noord', '2026-2027', 'Herfstvakantie', 'noord', '2026-10-17', '2026-10-25', '2026-10-03'),
        ('2026-herfst-midden', '2026-2027', 'Herfstvakantie', 'midden', '2026-10-17', '2026-10-25', '2026-10-03'),
        ('2026-herfst-zuid', '2026-2027', 'Herfstvakantie', 'zuid', '2026-10-24', '2026-11-01', '2026-10-10')
      ON CONFLICT(id) DO NOTHING
    `).run();

    // 4. Flagship Venues from Mockups
    const upsertVenue = db.prepare(`
      INSERT INTO venues (
        id, slug, municipality_slug, name, venue_type, enrichment_tier, operational_state,
        street_address, postcode_pc6, postcode_pc4, neighborhood_name, lat, lng,
        operator_name, is_nrz_licensed, is_knzb_affiliated, municipal_keurmerk_label,
        primary_water_treatment, has_wheelchair_lift, has_accessible_changing,
        parking_info_nl, ev_chargers_count, transit_chips_json,
        municipal_pass_name, municipal_pass_discount_nl,
        google_maps_embed_url, google_maps_route_url, official_website_url, official_tickets_url,
        rating_score, rating_count, min_single_price_cents, featured_badge_nl, content_hash
      ) VALUES (
        @id, @slug, @municipality_slug, @name, @venue_type, 'GOLD_STANDARD', 'OPEN_REGULAR',
        @street_address, @postcode_pc6, @postcode_pc4, @neighborhood_name, @lat, @lng,
        @operator_name, @is_nrz_licensed, @is_knzb_affiliated, @municipal_keurmerk_label,
        @primary_water_treatment, @has_wheelchair_lift, @has_accessible_changing,
        @parking_info_nl, @ev_chargers_count, @transit_chips_json,
        @municipal_pass_name, @municipal_pass_discount_nl,
        @google_maps_embed_url, @google_maps_route_url, @official_website_url, @official_tickets_url,
        @rating_score, @rating_count, @min_single_price_cents, @featured_badge_nl, 'seed-v1'
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        min_single_price_cents = excluded.min_single_price_cents,
        primary_water_treatment = excluded.primary_water_treatment
    `);

    const venues = [
      {
        id: 'venue-de-mirandabad',
        slug: 'de-mirandabad',
        municipality_slug: 'amsterdam',
        name: 'Zwemcentrum De Mirandabad',
        venue_type: 'SUBTROPICAL_PARADISE',
        street_address: 'De Mirandalaan 9',
        postcode_pc6: '1079 PA',
        postcode_pc4: '1079',
        neighborhood_name: 'Amsterdam Zuid (Rivierenbuurt)',
        lat: 52.3387,
        lng: 4.9021,
        operator_name: 'Gemeente Amsterdam Sportbedrijf',
        is_nrz_licensed: 1,
        is_knzb_affiliated: 1,
        municipal_keurmerk_label: 'Gemeente Amsterdam Keurmerk',
        primary_water_treatment: 'SALT_ELECTROLYSIS',
        has_wheelchair_lift: 1,
        has_accessible_changing: 1,
        parking_info_nl: 'Eigen parkeerterrein (€ 1,60/uur) + 12 laadpalen',
        ev_chargers_count: 12,
        transit_chips_json: JSON.stringify([
          { icon: 'tram', title: 'Tram 4 & 12', subtitle: 'Halte Waalstraat (4 min lopen)' },
          { icon: 'subway', title: 'Metro 52 & Station RAI', subtitle: 'Noord-Zuidlijn (8 min lopen)' },
          { icon: 'ev_station', title: 'Parkeren & Laadpalen', subtitle: 'Ruime parkeerplaats + 12 laadpalen' },
        ]),
        municipal_pass_name: 'Stadspas Amsterdam',
        municipal_pass_discount_nl: 'Stadspas met groene stip geeft recht op tot 80% korting op losse entree en zwemles.',
        google_maps_embed_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2437.747368127331!2d4.89994657661537!3d52.33872904963466!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47c60a25f227d8db%3A0xe3011aca3528d059!2sDe%20Mirandabad!5e0!3m2!1sen!2snl',
        google_maps_route_url: 'https://www.google.com/maps/dir/?api=1&destination=De+Mirandalaan+9+Amsterdam',
        official_website_url: 'https://www.amsterdam.nl/demirandabad/',
        official_tickets_url: 'https://www.amsterdam.nl/demirandabad/#tarieven',
        rating_score: 4.92,
        rating_count: 312,
        min_single_price_cents: 820,
        featured_badge_nl: 'Populairste Keuze',
      },
      {
        id: 'venue-sportfondsenbad-oost',
        slug: 'sportfondsenbad-oost',
        municipality_slug: 'amsterdam',
        name: 'Sportfondsenbad Amsterdam-Oost',
        venue_type: 'INDOOR_ONLY',
        street_address: 'Land van Cocagneplein 44',
        postcode_pc6: '1093 NB',
        postcode_pc4: '1093',
        neighborhood_name: 'Amsterdam Oost (Oostpoort)',
        lat: 52.3564,
        lng: 4.9275,
        operator_name: 'Sportfondsen Nederland',
        is_nrz_licensed: 1,
        is_knzb_affiliated: 1,
        municipal_keurmerk_label: 'NRZ Licentiehouder',
        primary_water_treatment: 'TRADITIONAL_CHLORINE',
        has_wheelchair_lift: 1,
        has_accessible_changing: 1,
        parking_info_nl: 'Parkeergarage Oostpoort op 150m',
        ev_chargers_count: 6,
        transit_chips_json: JSON.stringify([
          { icon: 'train', title: 'Station Muiderpoort', subtitle: '5 min lopen' },
          { icon: 'tram', title: 'Tram 1, 3 & 19', subtitle: 'Halte Wijttenbachstraat' },
        ]),
        municipal_pass_name: 'Stadspas Amsterdam',
        municipal_pass_discount_nl: 'Korting op banenzwemmen en Jeugdfonds Sport & Cultuur.',
        google_maps_embed_url: null,
        google_maps_route_url: 'https://www.google.com/maps/dir/?api=1&destination=Land+van+Cocagneplein+44+Amsterdam',
        official_website_url: 'https://sportfondsenbadoost.nl',
        official_tickets_url: 'https://sportfondsenbadoost.nl/tarieven',
        rating_score: 4.86,
        rating_count: 128,
        min_single_price_cents: 650,
        featured_badge_nl: null,
      },
      {
        id: 'venue-sloterparkbad',
        slug: 'sloterparkbad',
        municipality_slug: 'amsterdam',
        name: 'Sloterparkbad (Zwemschool De Dolfijn)',
        venue_type: 'INDOOR_AND_OUTDOOR',
        street_address: 'President Allendelaan 3',
        postcode_pc6: '1064 GW',
        postcode_pc4: '1064',
        neighborhood_name: 'Amsterdam Nieuw-West',
        lat: 52.3718,
        lng: 4.8054,
        operator_name: 'Optisport / Zwemschool De Dolfijn',
        is_nrz_licensed: 1,
        is_knzb_affiliated: 1,
        municipal_keurmerk_label: 'NRZ Licentiehouder',
        primary_water_treatment: 'SALT_ELECTROLYSIS',
        has_wheelchair_lift: 1,
        has_accessible_changing: 1,
        parking_info_nl: 'Gratis parkeren (blauwe zone 2,5 uur)',
        ev_chargers_count: 8,
        transit_chips_json: JSON.stringify([
          { icon: 'tram', title: 'Tram 13', subtitle: 'Halte Sloterparkbad' },
        ]),
        municipal_pass_name: 'Stadspas Amsterdam',
        municipal_pass_discount_nl: 'Stadspas geldig voor vrijzwemmen en zwemles.',
        google_maps_embed_url: null,
        google_maps_route_url: 'https://www.google.com/maps/dir/?api=1&destination=President+Allendelaan+3+Amsterdam',
        official_website_url: 'https://www.optisport.nl/sloterparkbad',
        official_tickets_url: 'https://www.optisport.nl/sloterparkbad',
        rating_score: 4.95,
        rating_count: 84,
        min_single_price_cents: 695,
        featured_badge_nl: 'NRZ Licentiehouder',
      },
      {
        id: 'venue-gaasperplas',
        slug: 'gaasperplas-open-water',
        municipality_slug: 'amsterdam',
        name: 'Gaasperplas Open Water Spot',
        venue_type: 'OPEN_WATER_NATURAL',
        street_address: 'Langbroekdreef',
        postcode_pc6: '1108 AZ',
        postcode_pc4: '1108',
        neighborhood_name: 'Amsterdam Zuidoost',
        lat: 52.3095,
        lng: 4.9912,
        operator_name: 'Rijkswaterstaat / Provincie Noord-Holland',
        is_nrz_licensed: 0,
        is_knzb_affiliated: 1,
        municipal_keurmerk_label: 'Schoon Zwemwater Keurmerk',
        primary_water_treatment: 'NATURAL_UNTREATED',
        has_wheelchair_lift: 0,
        has_accessible_changing: 0,
        parking_info_nl: 'Gratis parkeren bij Gaasperpark',
        ev_chargers_count: 4,
        transit_chips_json: JSON.stringify([
          { icon: 'subway', title: 'Metro 53', subtitle: 'Eindhalte Gaasperplas (3 min lopen)' },
        ]),
        municipal_pass_name: null,
        municipal_pass_discount_nl: null,
        google_maps_embed_url: null,
        google_maps_route_url: 'https://www.google.com/maps/dir/?api=1&destination=Gaasperplas+Amsterdam',
        official_website_url: 'https://www.zwemwater.nl',
        official_tickets_url: 'https://www.zwemwater.nl',
        rating_score: 4.78,
        rating_count: 95,
        min_single_price_cents: 0,
        featured_badge_nl: 'Natuurwater',
      },
      {
        id: 'venue-ra-utrecht',
        slug: 'ra-sports-swimming-utrecht',
        municipality_slug: 'utrecht',
        name: 'R&A Sports & Swimming - Utrecht',
        venue_type: 'BOUTIQUE_SWIM_SCHOOL_POOL',
        street_address: 'Grebbeberglaan 15',
        postcode_pc6: '3527 VX',
        postcode_pc4: '3544',
        neighborhood_name: 'Utrecht Leidsche Rijn',
        lat: 52.0985,
        lng: 5.0542,
        operator_name: 'R&A Sports & Swimming',
        is_nrz_licensed: 1,
        is_knzb_affiliated: 1,
        municipal_keurmerk_label: 'Direct Beschikbaar',
        primary_water_treatment: 'SALT_ELECTROLYSIS',
        has_wheelchair_lift: 1,
        has_accessible_changing: 1,
        parking_info_nl: 'Gratis parkeren voor de deur',
        ev_chargers_count: 6,
        transit_chips_json: JSON.stringify([]),
        municipal_pass_name: 'U-pas',
        municipal_pass_discount_nl: 'U-pas tegoed inzetbaar voor zwemles.',
        google_maps_embed_url: null,
        google_maps_route_url: null,
        official_website_url: 'https://rasports.nl',
        official_tickets_url: 'https://rasports.nl',
        rating_score: 4.90,
        rating_count: 160,
        min_single_price_cents: 750,
        featured_badge_nl: 'Direct Beschikbaar',
      },
      {
        id: 'venue-tongelreep-eindhoven',
        slug: 'tongelreep-zwemparadijs',
        municipality_slug: 'eindhoven',
        name: 'Nationaal Zwemcentrum de Tongelreep',
        venue_type: 'INDOOR_ONLY',
        street_address: 'Antoon Coolenlaan 1',
        postcode_pc6: '5644 RX',
        postcode_pc4: '5644',
        neighborhood_name: 'Eindhoven Zuid',
        lat: 51.4162,
        lng: 5.4792,
        operator_name: 'Gemeente Eindhoven',
        is_nrz_licensed: 1,
        is_knzb_affiliated: 1,
        municipal_keurmerk_label: 'KNZB Topsportlocatie',
        primary_water_treatment: 'TRADITIONAL_CHLORINE',
        has_wheelchair_lift: 1,
        has_accessible_changing: 1,
        parking_info_nl: 'Gratis parkeren op P1/P2',
        ev_chargers_count: 10,
        transit_chips_json: JSON.stringify([]),
        municipal_pass_name: 'Meedoen-regeling Eindhoven',
        municipal_pass_discount_nl: 'Korting via gemeentelijke sportregeling.',
        google_maps_embed_url: null,
        google_maps_route_url: null,
        official_website_url: 'https://www.eindhovensport.nl/zwemmen',
        official_tickets_url: 'https://www.eindhovensport.nl/zwemmen',
        rating_score: 4.88,
        rating_count: 420,
        min_single_price_cents: 710,
        featured_badge_nl: '50m Olympisch',
      },
    ];
    for (const v of venues) upsertVenue.run(v);

    // 5. Basins for De Mirandabad + Default Basins for others
    const upsertBasin = db.prepare(`
      INSERT INTO basins (id, venue_id, name_nl, basin_category, is_default_basin, is_indoor, length_meters, lanes_count, has_movable_floor, water_treatment, target_temp_celsius, warm_water_day_note_nl)
      VALUES (@id, @venue_id, @name_nl, @basin_category, @is_default_basin, @is_indoor, @length_meters, @lanes_count, @has_movable_floor, @water_treatment, @target_temp_celsius, @warm_water_day_note_nl)
      ON CONFLICT(id) DO UPDATE SET target_temp_celsius = excluded.target_temp_celsius
    `);
    const basins = [
      { id: 'basin-miranda-wave', venue_id: 'venue-de-mirandabad', name_nl: 'Golfslag- & Recreatiebad', basin_category: 'SUBTROPICAL_WAVE_RECREATION', is_default_basin: 1, is_indoor: 1, length_meters: 25, lanes_count: null, has_movable_floor: 0, water_treatment: 'SALT_ELECTROLYSIS', target_temp_celsius: 31.2, warm_water_day_note_nl: 'Heerlijk warm voor gezinnen' },
      { id: 'basin-miranda-50m', venue_id: 'venue-de-mirandabad', name_nl: '50m Wedstrijdbad', basin_category: 'COMPETITION_50M', is_default_basin: 0, is_indoor: 1, length_meters: 50, lanes_count: 8, has_movable_floor: 1, water_treatment: 'SALT_ELECTROLYSIS', target_temp_celsius: 27.8, warm_water_day_note_nl: 'Optimale sporttemperatuur' },
      { id: 'basin-miranda-toddler', venue_id: 'venue-de-mirandabad', name_nl: 'Peuter- & Kleuterbad', basin_category: 'TODDLER_POOL', is_default_basin: 0, is_indoor: 1, length_meters: 10, lanes_count: null, has_movable_floor: 0, water_treatment: 'SALT_ELECTROLYSIS', target_temp_celsius: 32.5, warm_water_day_note_nl: 'Extra behaaglijk voor de allerkleinsten' },
      { id: 'basin-oost-25m', venue_id: 'venue-sportfondsenbad-oost', name_nl: '25m Wedstrijdbad', basin_category: 'COMPETITION_25M', is_default_basin: 1, is_indoor: 1, length_meters: 25, lanes_count: 6, has_movable_floor: 1, water_treatment: 'TRADITIONAL_CHLORINE', target_temp_celsius: 28.5, warm_water_day_note_nl: null },
      { id: 'basin-sloter-50m', venue_id: 'venue-sloterparkbad', name_nl: '50m Binnenbad & Instructiebad', basin_category: 'COMPETITION_50M', is_default_basin: 1, is_indoor: 1, length_meters: 50, lanes_count: 8, has_movable_floor: 1, water_treatment: 'SALT_ELECTROLYSIS', target_temp_celsius: 29.0, warm_water_day_note_nl: null },
      { id: 'basin-gaasperplas', venue_id: 'venue-gaasperplas', name_nl: 'Gaasperplas Zwemzone Noord', basin_category: 'NATURAL_OPEN_WATER', is_default_basin: 1, is_indoor: 0, length_meters: 400, lanes_count: null, has_movable_floor: 0, water_treatment: 'NATURAL_UNTREATED', target_temp_celsius: null, warm_water_day_note_nl: null },
    ];
    for (const b of basins) upsertBasin.run(b);

    // 6. Outdoor conditions for Gaasperplas
    db.prepare(`
      INSERT INTO outdoor_conditions (id, venue_id, source_authority, water_temp_celsius, water_quality_state, wetsuit_advice_nl, measured_at, is_current)
      VALUES ('cond-gaasperplas-current', 'venue-gaasperplas', 'RIJKSWATERSTAAT', 14.2, 'CLEAN_APPROVED', 'Wetsuit vereist (3-5mm) + zwemboei', '2026-10-21T08:00:00Z', 1)
      ON CONFLICT(id) DO UPDATE SET water_temp_celsius = excluded.water_temp_celsius
    `).run();

    // 7. Tariffs for De Mirandabad (SCD Type 2)
    const upsertTariff = db.prepare(`
      INSERT INTO tariffs (id, venue_id, tariff_category, title_nl, subtitle_nl, price_cents, unit_label_nl, visits_included, is_highlighted, badge_nl, tariff_year, valid_from, valid_to, is_current)
      VALUES (@id, @venue_id, @tariff_category, @title_nl, @subtitle_nl, @price_cents, @unit_label_nl, @visits_included, @is_highlighted, @badge_nl, 2026, '2026-01-01', NULL, 1)
      ON CONFLICT(id) DO UPDATE SET price_cents = excluded.price_cents
    `);
    const tariffs = [
      { id: 'tariff-miranda-adult', venue_id: 'venue-de-mirandabad', tariff_category: 'SINGLE_ADULT', title_nl: 'Losse entree Recreatief / Banen', subtitle_nl: 'Toegang tot golfslagbad, 50m bad en stoomcabines', price_cents: 820, unit_label_nl: 'per sessie', visits_included: 1, is_highlighted: 0, badge_nl: null },
      { id: 'tariff-miranda-child', venue_id: 'venue-de-mirandabad', tariff_category: 'SINGLE_CHILD', title_nl: 'Kind entree (t/m 12 jr)', subtitle_nl: 'Toegang tot alle binnenbaden', price_cents: 650, unit_label_nl: 'per sessie', visits_included: 1, is_highlighted: 0, badge_nl: null },
      { id: 'tariff-miranda-10pass', venue_id: 'venue-de-mirandabad', tariff_category: 'MULTI_PASS_10', title_nl: '10-Badenkaart (6 maanden geldig)', subtitle_nl: 'Voordelig zwemmen voor frequente bezoekers (€ 7,40 per bezoek)', price_cents: 7400, unit_label_nl: '6 maanden geldig', visits_included: 10, is_highlighted: 0, badge_nl: '10% besparing' },
      { id: 'tariff-miranda-monthly', venue_id: 'venue-de-mirandabad', tariff_category: 'MONTHLY_UNLIMITED_LANES', title_nl: 'Maandabonnement Onbeperkt Banenzwemmen', subtitle_nl: 'Onbeperkt toegang op vroege ochtenden en avonduren', price_cents: 4950, unit_label_nl: 'per maand', visits_included: null, is_highlighted: 0, badge_nl: null },
      { id: 'tariff-miranda-zwemles', venue_id: 'venue-de-mirandabad', tariff_category: 'ZWEMLES_MONTHLY_PACKAGE', title_nl: 'Zwemlespakket Diploma A', subtitle_nl: 'Wekelijks 45 min les, incl. diplomagarantie & gratis vrijzwemmen', price_cents: 6800, unit_label_nl: 'per maand', visits_included: null, is_highlighted: 1, badge_nl: 'Meest gekozen' },
    ];
    for (const t of tariffs) upsertTariff.run(t);

    // 8. Schedule Period & Slots for De Mirandabad
    db.prepare(`
      INSERT INTO schedule_periods (id, venue_id, schedule_type, title_nl, valid_from, valid_to, priority, verification_state, verified_at)
      VALUES ('sched-miranda-2026-reg', 'venue-de-mirandabad', 'REGULAR_WINTER', 'Regulier Rooster 2026', '2026-09-01', '2027-06-30', 10, 'VERIFIED_PUBLISHED', '2026-10-01T10:00:00Z')
      ON CONFLICT(id) DO NOTHING
    `).run();

    const upsertSlot = db.prepare(`
      INSERT INTO schedule_slots (id, schedule_period_id, basin_id, day_of_week, activity_type, label_nl, start_time, end_time, crowd_indication, notes_nl)
      VALUES (@id, 'sched-miranda-2026-reg', @basin_id, @day_of_week, @activity_type, @label_nl, @start_time, @end_time, @crowd_indication, @notes_nl)
      ON CONFLICT(id) DO NOTHING
    `);
    for (let day = 1; day <= 7; day++) {
      upsertSlot.run({
        id: `slot-miranda-early-${day}`,
        basin_id: 'basin-miranda-50m',
        day_of_week: day,
        activity_type: 'BANENZWEMMEN',
        label_nl: 'Vroege Vogel Banen',
        start_time: '07:00',
        end_time: '09:30',
        crowd_indication: 'QUIET',
        notes_nl: 'Snelle & trage banen ingedeeld',
      });
      upsertSlot.run({
        id: `slot-miranda-rec-${day}`,
        basin_id: 'basin-miranda-wave',
        day_of_week: day,
        activity_type: 'VRIJZWEMMEN_RECREATIEF',
        label_nl: 'Subtropisch & Golven',
        start_time: '10:00',
        end_time: '18:30',
        crowd_indication: 'MODERATE',
        notes_nl: 'Elk heel uur golfslag',
      });
      upsertSlot.run({
        id: `slot-miranda-evening-${day}`,
        basin_id: 'basin-miranda-50m',
        day_of_week: day,
        activity_type: 'BANENZWEMMEN',
        label_nl: 'Avond Banenzwemmen 50m',
        start_time: '19:00',
        end_time: '22:00',
        crowd_indication: 'QUIET',
        notes_nl: '8 banen geopend',
      });
    }

    // 9. Swim Providers & Offerings (Waitlists)
    db.prepare(`
      INSERT INTO swim_providers (id, slug, name, provider_type, is_nrz_licensed, methodology_nl, b2b_partner_state, official_registration_url)
      VALUES
        ('prov-miranda-gemeente', 'gemeente-amsterdam-mirandabad', 'Gemeente Amsterdam (De Mirandabad)', 'MUNICIPAL_OPERATOR', 1, 'NRZ Zwem-ABC', 'UNCLAIMED', 'https://www.amsterdam.nl/demirandabad/zwemles/'),
        ('prov-dolfijn', 'zwemschool-de-dolfijn', 'Zwemschool De Dolfijn', 'COMMERCIAL_SWIM_SCHOOL', 1, 'NRZ Zwem-ABC Kleine Groepen', 'UNCLAIMED', 'https://zwemschooldedolfijn.nl'),
        ('prov-oost', 'sportfondsen-oost-zwemles', 'Sportfondsenbad Oost Zwemles', 'MUNICIPAL_OPERATOR', 1, 'NRZ Zwem-ABC', 'UNCLAIMED', 'https://sportfondsenbadoost.nl/zwemles')
      ON CONFLICT(id) DO NOTHING
    `).run();

    db.prepare(`
      INSERT INTO venue_swim_offerings (id, venue_id, provider_id, diploma_track, monthly_price_cents, has_diploma_guarantee, group_max_size, lesson_duration_mins, current_waitlist_weeks_min, current_waitlist_weeks_max, direct_spots_note_nl, registration_url)
      VALUES
        ('off-miranda-a', 'venue-de-mirandabad', 'prov-miranda-gemeente', 'DIPLOMA_A', 6800, 1, 8, 45, 4, 6, 'Direct instromen mogelijk voor woensdagmiddag & zaterdagochtend (Nog 3 plekken)', 'https://www.amsterdam.nl/demirandabad/zwemles/'),
        ('off-dolfijn-a', 'venue-sloterparkbad', 'prov-dolfijn', 'DIPLOMA_A', 6450, 1, 6, 45, 6, 6, 'Kleine groepen in warm zoutwater', 'https://zwemschooldedolfijn.nl'),
        ('off-oost-a', 'venue-sportfondsenbad-oost', 'prov-oost', 'DIPLOMA_A', 6100, 0, 10, 45, 16, 20, 'Reguliere wachtlijst Amsterdam-Oost', 'https://sportfondsenbadoost.nl/zwemles')
      ON CONFLICT(id) DO UPDATE SET
        current_waitlist_weeks_min = excluded.current_waitlist_weeks_min,
        current_waitlist_weeks_max = excluded.current_waitlist_weeks_max
    `).run();

    // 10. Affiliate Product Stubs (Disabled by default per spec)
    db.prepare(`
      INSERT INTO affiliate_product_stubs (slug, context_rule, title_nl, target_url, is_enabled)
      VALUES
        ('neopreen-wetsuit-4mm', 'COLD_OPEN_WATER', 'Getest 4/3mm Open-Water Wetsuit', 'https://allezwembaden.nl/#wetsuit-stub', 0),
        ('anti-chloor-shampoo', 'CHLORINE_CARE', 'Verzorgende Anti-Chloor Shampoo', 'https://allezwembaden.nl/#shampoo-stub', 0)
      ON CONFLICT(slug) DO NOTHING
    `).run();
  });

  tx();
}
```

Create `src/db/queries.ts`:
```typescript
import type { SqliteDatabase } from './client';
import { computeBoundingBox, haversineDistanceKm } from './geo';

export interface VenueRow {
  id: string;
  slug: string;
  municipality_slug: string;
  name: string;
  venue_type: string;
  enrichment_tier: string;
  operational_state: string;
  street_address: string | null;
  postcode_pc6: string | null;
  postcode_pc4: string | null;
  neighborhood_name: string | null;
  lat: number;
  lng: number;
  operator_name: string | null;
  is_nrz_licensed: number;
  is_knzb_affiliated: number;
  municipal_keurmerk_label: string | null;
  primary_water_treatment: 'SALT_ELECTROLYSIS' | 'TRADITIONAL_CHLORINE' | 'UV_LOW_CHLORINE' | 'NATURAL_UNTREATED';
  has_wheelchair_lift: number;
  has_accessible_changing: number;
  parking_info_nl: string | null;
  ev_chargers_count: number;
  transit_chips_json: string;
  municipal_pass_name: string | null;
  municipal_pass_discount_nl: string | null;
  google_maps_embed_url: string | null;
  google_maps_route_url: string | null;
  official_website_url: string | null;
  official_tickets_url: string | null;
  rating_score: number | null;
  rating_count: number;
  min_single_price_cents: number | null;
  featured_badge_nl: string | null;
  lastmod_at: string;
}

export interface BasinRow {
  id: string;
  venue_id: string;
  name_nl: string;
  basin_category: string;
  is_default_basin: number;
  is_indoor: number;
  length_meters: number | null;
  lanes_count: number | null;
  water_treatment: string;
  target_temp_celsius: number | null;
  warm_water_day_note_nl: string | null;
}

export interface TariffRow {
  id: string;
  venue_id: string;
  tariff_category: string;
  title_nl: string;
  subtitle_nl: string | null;
  price_cents: number;
  unit_label_nl: string;
  visits_included: number | null;
  is_highlighted: number;
  badge_nl: string | null;
}

export interface ScheduleSlotRow {
  id: string;
  day_of_week: number;
  activity_type: string;
  label_nl: string;
  start_time: string;
  end_time: string;
  crowd_indication: string | null;
  notes_nl: string | null;
}

export interface SwimOfferingRow {
  id: string;
  venue_id: string;
  venue_name: string;
  venue_slug: string;
  municipality_slug: string;
  provider_name: string;
  diploma_track: string;
  monthly_price_cents: number | null;
  has_diploma_guarantee: number;
  current_waitlist_weeks_min: number;
  current_waitlist_weeks_max: number;
  direct_spots_note_nl: string | null;
  registration_url: string | null;
  primary_water_treatment: string;
  distance_km?: number;
}

export interface VenueDetail extends VenueRow {
  basins: BasinRow[];
  tariffs: TariffRow[];
  slots: ScheduleSlotRow[];
  offerings: SwimOfferingRow[];
  outdoor_temp_celsius: number | null;
  wetsuit_advice_nl: string | null;
}

export function getVenueByCityAndSlug(
  db: SqliteDatabase,
  citySlug: string,
  venueSlug: string
): VenueDetail | null {
  const venue = db
    .prepare('SELECT * FROM venues WHERE municipality_slug = ? AND slug = ?')
    .get(citySlug, venueSlug) as VenueRow | undefined;

  if (!venue) return null;

  const basins = db
    .prepare('SELECT * FROM basins WHERE venue_id = ? ORDER BY is_default_basin DESC')
    .all(venue.id) as BasinRow[];

  const tariffs = db
    .prepare('SELECT * FROM tariffs WHERE venue_id = ? AND is_current = 1 ORDER BY price_cents ASC')
    .all(venue.id) as TariffRow[];

  const slots = db
    .prepare(
      `SELECT s.* FROM schedule_slots s
       JOIN schedule_periods p ON s.schedule_period_id = p.id
       WHERE p.venue_id = ?
       ORDER BY p.priority DESC, s.day_of_week ASC, s.start_time ASC`
    )
    .all(venue.id) as ScheduleSlotRow[];

  const offerings = db
    .prepare(
      `SELECT o.*, v.name AS venue_name, v.slug AS venue_slug, v.municipality_slug,
              v.primary_water_treatment, sp.name AS provider_name
       FROM venue_swim_offerings o
       JOIN venues v ON o.venue_id = v.id
       JOIN swim_providers sp ON o.provider_id = sp.id
       WHERE o.venue_id = ?`
    )
    .all(venue.id) as SwimOfferingRow[];

  const outdoor = db
    .prepare('SELECT water_temp_celsius, wetsuit_advice_nl FROM outdoor_conditions WHERE venue_id = ? AND is_current = 1')
    .get(venue.id) as { water_temp_celsius: number | null; wetsuit_advice_nl: string | null } | undefined;

  return {
    ...venue,
    basins,
    tariffs,
    slots,
    offerings,
    outdoor_temp_celsius: outdoor?.water_temp_celsius ?? null,
    wetsuit_advice_nl: outdoor?.wetsuit_advice_nl ?? null,
  };
}

export function listVenuesByCity(db: SqliteDatabase, citySlug: string): VenueRow[] {
  return db
    .prepare('SELECT * FROM venues WHERE municipality_slug = ? ORDER BY rating_score DESC')
    .all(citySlug) as VenueRow[];
}

export function listAllVenues(db: SqliteDatabase): VenueRow[] {
  return db.prepare('SELECT * FROM venues ORDER BY rating_score DESC').all() as VenueRow[];
}

export function findVenuesNearPostcodePc4(
  db: SqliteDatabase,
  pc4: string,
  radiusKm: number
): Array<VenueRow & { distance_km: number }> {
  const origin = db
    .prepare('SELECT lat, lng FROM postcode_pc4 WHERE pc4 = ?')
    .get(pc4) as { lat: number; lng: number } | undefined;

  if (!origin) return [];

  const bbox = computeBoundingBox(origin.lat, origin.lng, radiusKm);
  const candidates = db
    .prepare(
      `SELECT * FROM venues
       WHERE lat BETWEEN @minLat AND @maxLat
         AND lng BETWEEN @minLng AND @maxLng`
    )
    .all(bbox) as VenueRow[];

  return candidates
    .map((v) => ({
      ...v,
      distance_km: haversineDistanceKm(origin.lat, origin.lng, v.lat, v.lng),
    }))
    .filter((v) => v.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km);
}

export function findShortestWaitlistOfferingsNearPc4(
  db: SqliteDatabase,
  pc4: string,
  diplomaTrack: string,
  radiusKm: number,
  limit = 3
): SwimOfferingRow[] {
  const nearbyVenues = findVenuesNearPostcodePc4(db, pc4, radiusKm);
  if (nearbyVenues.length === 0) return [];

  const distanceByVenueId = new Map(nearbyVenues.map((v) => [v.id, v.distance_km]));
  const placeholders = nearbyVenues.map(() => '?').join(',');

  const rows = db
    .prepare(
      `SELECT o.*, v.name AS venue_name, v.slug AS venue_slug, v.municipality_slug,
              v.primary_water_treatment, sp.name AS provider_name
       FROM venue_swim_offerings o
       JOIN venues v ON o.venue_id = v.id
       JOIN swim_providers sp ON o.provider_id = sp.id
       WHERE o.diploma_track = ?
         AND o.venue_id IN (${placeholders})
       ORDER BY o.current_waitlist_weeks_min ASC, o.monthly_price_cents ASC`
    )
    .all(diplomaTrack, ...nearbyVenues.map((v) => v.id)) as SwimOfferingRow[];

  return rows.slice(0, limit).map((r) => ({
    ...r,
    distance_km: distanceByVenueId.get(r.venue_id) ?? 0,
  }));
}
```

Create `src/cli/run-seed.ts`:
```typescript
import path from 'node:path';
import { createDatabase, applyDetailedSchema } from '../db/client';
import { seedInitialDataset } from '../db/seed';
import { createRunLogger } from '../lib/logger';

const dbPath = path.resolve(process.cwd(), 'data/allezwembaden.sqlite');
const logger = createRunLogger({ runId: `${new Date().toISOString().slice(0, 10)}_seed` });

logger.info('SEED_INIT', 'Applying schema and seeding baseline dataset', { dbPath });
const db = createDatabase(dbPath);
applyDetailedSchema(db);
seedInitialDataset(db);
const count = (db.prepare('SELECT COUNT(*) as c FROM venues').get() as { c: number }).c;
logger.info('SEED_COMPLETE', 'Database seeded successfully', { venuesCount: count });
db.close();
```

- [ ] **Step 4: Run tests and seed script to verify everything passes**

Run: `pnpm test && pnpm db:seed`
Expected: All tests in `tests/lib/logger.test.ts`, `tests/db/client.test.ts`, `tests/db/geo.test.ts`, and `tests/db/seed-and-queries.test.ts` PASS, and `logs/runs/` contains the `*_seed.log` and `*_seed.jsonl` files.

- [ ] **Step 5: Commit seeder and queries**

```bash
git add src/db/seed.ts src/db/queries.ts src/cli/run-seed.ts tests/db/seed-and-queries.test.ts
git commit -m "feat(db): add idempotent flagship venue seeder and geospatial/waitlist queries"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 1.5 `[x]`:**
> 1. You observed `tests/db/seed-and-queries.test.ts` **FAIL** in Step 2 before creating `src/db/seed.ts` and `src/db/queries.ts`.
> 2. `pnpm test` passes all 4 test files in Milestone 1 with `0` errors.
> 3. Running `pnpm db:seed` twice in a row succeeds idempotently without duplicate rows or SQLite constraint errors, and writes a run log to `logs/runs/*_seed.log` and `*_seed.jsonl`.
> 4. Changes are committed and all checkboxes in Task 1.5 are marked `[x]`.

---

## 🛑 Milestone 1 Verification Gate (Check All Before Starting Milestone 2!)

- [ ] `pnpm test` runs and passes 100% of Milestone 1 tests (`logger`, `client`, `geo`, `seed-and-queries`).
- [ ] `pnpm db:seed` creates `data/allezwembaden.sqlite` and populates `logs/runs/*_seed.log` and `*_seed.jsonl`.
- [ ] Running `pnpm db:seed` a second time succeeds with zero duplicate errors (idempotency verified).
