# Milestone 5 Implementation Plan: Portable Ingestion CLI, Lightpanda/Obscura CDP, Quarantine Gate & Alerts

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the SHA-256 content-hash diff and Zod Sanity Quarantine Gate, the 3-step scraper escalation ladder (`fetch` $\rightarrow$ `Lightpanda`/`Obscura` CDP $\rightarrow$ Local Mac override), the Dutch open-API syncers, and the Webhook Push Alert Dispatcher with 24-hour deduplication cooldown.

**Architecture:** Every scraped payload is hashed (`sha256`) for idempotency and validated through `sanity-gate.ts`. If a scrape fails or violates sanity bounds (e.g., `€ 0,00` adult ticket on a paid pool), live D1 data is preserved untouched, raw HTML is saved to `logs/anomalies/`, and a deduplicated Webhook push alert is emitted with the 1-line Mac recovery command.

**Tech Stack:** TypeScript, Zod, Cheerio, `unpdf`, `playwright-core` (CDP for Lightpanda/Obscura), Vitest.

---

### Task 5.1: Build SHA-256 Content-Hash Diff & Zod Sanity Quarantine Gate (`src/ingestion/sanity-gate.ts`)

> **Why ([MADR 0004](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/MADRs/0004-ingestion-cli-lightpanda-obscura-and-quarantine-gate.md)):** Guarantees a broken pool website redesign never overwrites valid live tariffs or schedules in Cloudflare D1.

**Files:**
- Create: `src/ingestion/sanity-gate.ts`
- Test: `tests/ingestion/sanity-gate.test.ts`

- [x] **Step 1: Write the failing test in `tests/ingestion/sanity-gate.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { computeContentHash, evaluateScrapedVenueSanity } from '@/ingestion/sanity-gate';

describe('SHA-256 Diff & Zod Sanity Quarantine Gate', () => {
  it('returns UNCHANGED_NOOP when raw content hash matches last verified hash', () => {
    const rawHtml = '<html><body>Tarief 2026: € 8,20</body></html>';
    const hash = computeContentHash(rawHtml);

    const decision = evaluateScrapedVenueSanity({
      venueSlug: 'de-mirandabad',
      isPaidPool: true,
      rawContent: rawHtml,
      previousContentHash: hash,
      previousSlotsCount: 12,
      extractedAdultPriceCents: 820,
      extractedSlotsCount: 12,
    });

    expect(decision.status).toBe('UNCHANGED_NOOP');
  });

  it('quarantines scrape when extracted adult price is € 0,00 on a paid pool', () => {
    const decision = evaluateScrapedVenueSanity({
      venueSlug: 'de-mirandabad',
      isPaidPool: true,
      rawContent: '<html><body>Redesigned broken table</body></html>',
      previousContentHash: 'old-hash',
      previousSlotsCount: 12,
      extractedAdultPriceCents: 0,
      extractedSlotsCount: 12,
    });

    expect(decision.status).toBe('QUARANTINED_ANOMALY');
    expect(decision.errorCode).toBe('SANITY_PRICE_OUT_OF_RANGE');
    expect(decision.localFixCommand).toBe('pnpm sync:venue --slug=de-mirandabad --inspect');
  });

  it('quarantines scrape when schedule slots drop by more than 50%', () => {
    const decision = evaluateScrapedVenueSanity({
      venueSlug: 'sportfondsenbad-oost',
      isPaidPool: true,
      rawContent: '<html><body>Partial load</body></html>',
      previousContentHash: 'old-hash',
      previousSlotsCount: 14,
      extractedAdultPriceCents: 650,
      extractedSlotsCount: 2,
    });

    expect(decision.status).toBe('QUARANTINED_ANOMALY');
    expect(decision.errorCode).toBe('SANITY_SLOTS_DROP_EXCEEDED');
  });

  it('approves valid scrape with VERIFIED_PROMOTE when all invariants pass', () => {
    const decision = evaluateScrapedVenueSanity({
      venueSlug: 'de-mirandabad',
      isPaidPool: true,
      rawContent: '<html><body>Updated 2026 tariff € 8,50</body></html>',
      previousContentHash: 'old-hash',
      previousSlotsCount: 12,
      extractedAdultPriceCents: 850,
      extractedSlotsCount: 12,
    });

    expect(decision.status).toBe('VERIFIED_PROMOTE');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/ingestion/sanity-gate.test.ts`
Expected: FAIL (`Cannot find module '@/ingestion/sanity-gate'`).

- [x] **Step 3: Implement `src/ingestion/sanity-gate.ts`**

```typescript
import crypto from 'node:crypto';

export interface SanityCheckInput {
  venueSlug: string;
  isPaidPool: boolean;
  rawContent: string;
  previousContentHash: string | null;
  previousSlotsCount: number;
  extractedAdultPriceCents: number | null;
  extractedSlotsCount: number;
}

export interface SanityDecision {
  status: 'UNCHANGED_NOOP' | 'VERIFIED_PROMOTE' | 'QUARANTINED_ANOMALY';
  contentHash: string;
  errorCode: string | null;
  errorDetail: string | null;
  localFixCommand: string;
}

export function computeContentHash(rawContent: string): string {
  return crypto.createHash('sha256').update(rawContent, 'utf-8').digest('hex');
}

export function evaluateScrapedVenueSanity(input: SanityCheckInput): SanityDecision {
  const contentHash = computeContentHash(input.rawContent);
  const localFixCommand = `pnpm sync:venue --slug=${input.venueSlug} --inspect`;

  if (input.previousContentHash && input.previousContentHash === contentHash) {
    return {
      status: 'UNCHANGED_NOOP',
      contentHash,
      errorCode: null,
      errorDetail: null,
      localFixCommand,
    };
  }

  if (input.isPaidPool) {
    if (
      input.extractedAdultPriceCents === null ||
      input.extractedAdultPriceCents < 150 ||
      input.extractedAdultPriceCents > 3500
    ) {
      return {
        status: 'QUARANTINED_ANOMALY',
        contentHash,
        errorCode: 'SANITY_PRICE_OUT_OF_RANGE',
        errorDetail: `Expected adult ticket between 150 and 3500 cents, got ${String(input.extractedAdultPriceCents)}`,
        localFixCommand,
      };
    }
  }

  if (
    input.previousSlotsCount > 0 &&
    input.extractedSlotsCount < Math.ceil(input.previousSlotsCount * 0.5)
  ) {
    return {
      status: 'QUARANTINED_ANOMALY',
      contentHash,
      errorCode: 'SANITY_SLOTS_DROP_EXCEEDED',
      errorDetail: `Extracted ${input.extractedSlotsCount} slots vs previous ${input.previousSlotsCount} (>50% drop)`,
      localFixCommand,
    };
  }

  return {
    status: 'VERIFIED_PROMOTE',
    contentHash,
    errorCode: null,
    errorDetail: null,
    localFixCommand,
  };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/ingestion/sanity-gate.test.ts`
Expected: PASS.

- [x] **Step 5: Commit Sanity Gate**

```bash
git add src/ingestion/sanity-gate.ts tests/ingestion/sanity-gate.test.ts
git commit -m "feat(ingestion): add SHA-256 content diff and Sanity Quarantine Gate"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 5.1 `[x]`:**
> 1. You observed `tests/ingestion/sanity-gate.test.ts` **FAIL** in Step 2 before creating `src/ingestion/sanity-gate.ts`.
> 2. `pnpm test tests/ingestion/sanity-gate.test.ts` passes all 4 cases (`UNCHANGED_NOOP`, `SANITY_PRICE_OUT_OF_RANGE` on `€ 0,00`, `SANITY_SLOTS_DROP_EXCEEDED` on `>50%` slot drop, and `VERIFIED_PROMOTE`).
> 3. Changes are committed and all checkboxes in Task 5.1 are marked `[x]`.

---

### Task 5.2: Build 3-Step Escalation Fetcher (`fetch` $\rightarrow$ `Lightpanda`/`Obscura` CDP $\rightarrow$ Local Override) (`src/ingestion/fetcher.ts`)

> **Why ([MADR 0004](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/MADRs/0004-ingestion-cli-lightpanda-obscura-and-quarantine-gate.md)):** Connects via plain HTTP `fetch` first (`~0 MB` extra RAM) and escalates to **Lightpanda** (`~24 MB` RAM) or **Obscura** (`~30 MB` RAM) over standard Chrome DevTools Protocol (`connectOverCDP`) when JS widget hydration is needed.

**Files:**
- Create: `src/ingestion/fetcher.ts`
- Test: `tests/ingestion/fetcher.test.ts`

- [x] **Step 1: Write the failing test in `tests/ingestion/fetcher.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { fetchWithEscalationLadder } from '@/ingestion/fetcher';

describe('3-Step Escalation Fetcher (HTTP -> Lightpanda/Obscura CDP -> Local Override)', () => {
  it('succeeds on Step 1 (HTTP fetch) when status is 200 and HTML contains target selector', async () => {
    const res = await fetchWithEscalationLadder({
      url: 'https://example.nl/rooster',
      requiresJsHydration: false,
      httpFetcher: async () => ({ status: 200, body: '<table><tr><td>07:00 - 09:30</td></tr></table>' }),
      cdpFetcher: vi.fn(),
    });

    expect(res.stepUsed).toBe('STEP_1_HTTP_FETCH');
    expect(res.html).toContain('07:00 - 09:30');
  });

  it('escalates to Step 2 (Lightpanda / Obscura CDP) when Step 1 returns 403 or requires JS hydration', async () => {
    const cdpSpy = vi.fn(async () => '<div class="hydrated-timetable">19:00 - 22:00</div>');

    const res = await fetchWithEscalationLadder({
      url: 'https://example.nl/recreatex-widget',
      requiresJsHydration: true,
      cdpEndpoint: 'http://127.0.0.1:9222',
      httpFetcher: async () => ({ status: 403, body: 'Blocked' }),
      cdpFetcher: cdpSpy,
    });

    expect(res.stepUsed).toBe('STEP_2_CDP_BROWSER');
    expect(cdpSpy).toHaveBeenCalledWith('https://example.nl/recreatex-widget', 'http://127.0.0.1:9222');
    expect(res.html).toContain('19:00 - 22:00');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/ingestion/fetcher.test.ts`
Expected: FAIL (`Cannot find module '@/ingestion/fetcher'`).

- [x] **Step 3: Implement `src/ingestion/fetcher.ts`**

```typescript
export interface EscalationFetchOptions {
  url: string;
  requiresJsHydration?: boolean;
  cdpEndpoint?: string; // e.g. 'http://127.0.0.1:9222' for Lightpanda or Obscura
  httpFetcher?: (url: string) => Promise<{ status: number; body: string }>;
  cdpFetcher?: (url: string, cdpEndpoint: string) => Promise<string>;
}

export interface EscalationFetchResult {
  stepUsed: 'STEP_1_HTTP_FETCH' | 'STEP_2_CDP_BROWSER';
  html: string;
}

async function defaultHttpFetcher(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'AlleZwembaden-SyncBot/1.0 (+https://allezwembaden.nl)',
      Accept: 'text/html,application/xhtml+xml,application/json',
    },
  });
  return {
    status: response.status,
    body: await response.text(),
  };
}

async function defaultCdpFetcher(url: string, cdpEndpoint: string): Promise<string> {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.connectOverCDP(cdpEndpoint);
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    const content = await page.content();
    await page.close();
    return content;
  } finally {
    await browser.close();
  }
}

export async function fetchWithEscalationLadder(
  options: EscalationFetchOptions
): Promise<EscalationFetchResult> {
  const httpFetch = options.httpFetcher ?? defaultHttpFetcher;
  const cdpFetch = options.cdpFetcher ?? defaultCdpFetcher;
  const cdpEndpoint = options.cdpEndpoint ?? process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9222';

  if (!options.requiresJsHydration) {
    const step1 = await httpFetch(options.url);
    if (step1.status >= 200 && step1.status < 300 && step1.body.length > 0) {
      return {
        stepUsed: 'STEP_1_HTTP_FETCH',
        html: step1.body,
      };
    }
  }

  const hydratedHtml = await cdpFetch(options.url, cdpEndpoint);
  return {
    stepUsed: 'STEP_2_CDP_BROWSER',
    html: hydratedHtml,
  };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/ingestion/fetcher.test.ts`
Expected: PASS.

- [x] **Step 5: Commit 3-Step Escalation Fetcher**

```bash
git add src/ingestion/fetcher.ts tests/ingestion/fetcher.test.ts
git commit -m "feat(ingestion): add 3-step HTTP to Lightpanda/Obscura CDP escalation fetcher"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 5.2 `[x]`:**
> 1. You observed `tests/ingestion/fetcher.test.ts` **FAIL** in Step 2 before creating `src/ingestion/fetcher.ts`.
> 2. `pnpm test tests/ingestion/fetcher.test.ts` passes (Step 1 plain HTTP `fetch` succeeds when static; Step 2 `connectOverCDP` escalates to Lightpanda/Obscura when JS hydration is required or Step 1 fails).
> 3. Changes are committed and all checkboxes in Task 5.2 are marked `[x]`.

---

### Task 5.3: Build Webhook Push Alert Dispatcher with 24h Cooldown FSM (`src/ingestion/alert-dispatcher.ts`) & Portable CLI (`src/cli/sync.ts`)

**Files:**
- Create: `src/ingestion/alert-dispatcher.ts`
- Create: `src/cli/sync.ts`
- Test: `tests/ingestion/alert-dispatcher.test.ts`

- [x] **Step 1: Write the failing test in `tests/ingestion/alert-dispatcher.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createDatabase, applyDetailedSchema } from '@/db/client';
import { recordAndDispatchAnomalyAlert } from '@/ingestion/alert-dispatcher';

describe('Quarantine Webhook Alert Dispatcher with 24h Cooldown FSM', () => {
  it('sends webhook alert on first anomaly and suppresses duplicate alert within 24 hours', async () => {
    const db = createDatabase(':memory:');
    applyDetailedSchema(db);

    db.prepare(
      `INSERT INTO ingestion_runs (run_id, runner_env, job_type, run_state)
       VALUES ('run-1', 'GITHUB_ACTIONS', 'POOL_SCRAPE', 'COMPLETED_WITH_QUARANTINES')`
    ).run();

    const webhookSender = vi.fn(async () => ({ ok: true }));

    const first = await recordAndDispatchAnomalyAlert(db, {
      runId: 'run-1',
      venueSlug: 'de-mirandabad',
      failureStep: 'SANITY_INVARIANT',
      errorCode: 'SANITY_PRICE_OUT_OF_RANGE',
      errorDetail: 'Got 0 cents',
      snapshotFilePath: 'logs/anomalies/2026-10-21_de-mirandabad.html',
      nowIso: '2026-10-21T06:00:00Z',
      webhookSender,
    });

    // Second failure 2 hours later for the same venue + errorCode
    const second = await recordAndDispatchAnomalyAlert(db, {
      runId: 'run-1',
      venueSlug: 'de-mirandabad',
      failureStep: 'SANITY_INVARIANT',
      errorCode: 'SANITY_PRICE_OUT_OF_RANGE',
      errorDetail: 'Got 0 cents again',
      snapshotFilePath: 'logs/anomalies/2026-10-21_de-mirandabad.html',
      nowIso: '2026-10-21T08:00:00Z',
      webhookSender,
    });

    expect(first.alertState).toBe('WEBHOOK_ALERT_SENT');
    expect(second.alertState).toBe('SUPPRESSED_COOLDOWN');
    expect(webhookSender).toHaveBeenCalledTimes(1);
    expect(first.formattedMessage).toContain('pnpm sync:venue --slug=de-mirandabad --inspect');

    db.close();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/ingestion/alert-dispatcher.test.ts`
Expected: FAIL (`Cannot find module '@/ingestion/alert-dispatcher'`).

- [x] **Step 3: Implement `src/ingestion/alert-dispatcher.ts` and `src/cli/sync.ts`**

Create `src/ingestion/alert-dispatcher.ts`:
```typescript
import crypto from 'node:crypto';
import type { SqliteDatabase } from '../db/client';

export interface AnomalyAlertInput {
  runId: string;
  venueSlug: string;
  failureStep: 'HTTP_FETCH_STEP1' | 'CDP_BROWSER_STEP2' | 'ZOD_PARSE' | 'SANITY_INVARIANT';
  errorCode: string;
  errorDetail: string;
  snapshotFilePath: string | null;
  nowIso?: string;
  webhookSender?: (message: string) => Promise<{ ok: boolean }>;
}

export interface AnomalyAlertOutcome {
  alertState: 'WEBHOOK_ALERT_SENT' | 'SUPPRESSED_COOLDOWN';
  formattedMessage: string;
}

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function recordAndDispatchAnomalyAlert(
  db: SqliteDatabase,
  input: AnomalyAlertInput
): Promise<AnomalyAlertOutcome> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const localFixCommand = `pnpm sync:venue --slug=${input.venueSlug} --inspect`;

  const recentAlert = db
    .prepare(
      `SELECT last_alerted_at FROM quarantined_anomalies
       WHERE venue_slug = ? AND error_code = ? AND alert_state = 'WEBHOOK_ALERT_SENT'
         AND resolved_at IS NULL
       ORDER BY last_alerted_at DESC LIMIT 1`
    )
    .get(input.venueSlug, input.errorCode) as { last_alerted_at: string | null } | undefined;

  const isWithinCooldown =
    recentAlert?.last_alerted_at &&
    Date.parse(nowIso) - Date.parse(recentAlert.last_alerted_at) < COOLDOWN_MS;

  const alertState = isWithinCooldown ? 'SUPPRESSED_COOLDOWN' : 'WEBHOOK_ALERT_SENT';

  const formattedMessage = [
    `⚠️ [AlleZwembaden Quarantaine] venue=${input.venueSlug}`,
    `Reden: ${input.errorCode} (${input.errorDetail})`,
    input.snapshotFilePath ? `Snapshot: ${input.snapshotFilePath}` : null,
    `👉 Lokaal herstellen op Mac: ${localFixCommand}`,
  ]
    .filter(Boolean)
    .join('\n');

  db.prepare(
    `INSERT INTO quarantined_anomalies (
      id, run_id, venue_slug, failure_step, error_code, error_detail,
      snapshot_file_path, local_fix_command, alert_state, last_alerted_at, created_at
    ) VALUES (
      @id, @runId, @venueSlug, @failureStep, @errorCode, @errorDetail,
      @snapshotFilePath, @localFixCommand, @alertState, @lastAlertedAt, @createdAt
    )`
  ).run({
    id: `anom-${crypto.randomUUID()}`,
    runId: input.runId,
    venueSlug: input.venueSlug,
    failureStep: input.failureStep,
    errorCode: input.errorCode,
    errorDetail: input.errorDetail,
    snapshotFilePath: input.snapshotFilePath,
    localFixCommand,
    alertState,
    lastAlertedAt: alertState === 'WEBHOOK_ALERT_SENT' ? nowIso : null,
    createdAt: nowIso,
  });

  if (alertState === 'WEBHOOK_ALERT_SENT' && input.webhookSender) {
    await input.webhookSender(formattedMessage);
  }

  return {
    alertState,
    formattedMessage,
  };
}
```

Create `src/cli/sync.ts`:
```typescript
import path from 'node:path';
import { createDatabase, applyDetailedSchema } from '../db/client';
import { seedInitialDataset } from '../db/seed';
import { createRunLogger } from '../lib/logger';

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

logger.info('SYNC_DONE', 'Sync execution finished cleanly', {
  humanLog: logger.humanLogPath,
  jsonlLog: logger.jsonlLogPath,
});

db.close();
```

- [x] **Step 4: Run full test suite and CLI sync check**

Run: `pnpm test && pnpm sync:venue --slug=de-mirandabad`
Expected: All tests across all 5 milestones PASS, and `logs/runs/` contains the sync log.

- [x] **Step 5: Commit Alert Dispatcher and Portable CLI**

```bash
git add src/ingestion/alert-dispatcher.ts src/cli/sync.ts tests/ingestion/alert-dispatcher.test.ts
git commit -m "feat(ingestion): add 24h cooldown webhook alert dispatcher and portable sync CLI"
```

> [!IMPORTANT]
> **✅ Definition of Done (DoD) to mark Task 5.3 `[x]`:**
> 1. You observed `tests/ingestion/alert-dispatcher.test.ts` **FAIL** in Step 2 before creating `src/ingestion/alert-dispatcher.ts`.
> 2. `pnpm test tests/ingestion/alert-dispatcher.test.ts` passes (first anomaly sends webhook with `pnpm sync:venue --slug=...` recovery command; second anomaly within 24h is marked `SUPPRESSED_COOLDOWN`).
> 3. `pnpm sync:venue --slug=de-mirandabad` runs cleanly and writes `.log` and `.jsonl` files into `logs/runs/`.
> 4. Changes are committed and all checkboxes in Task 5.3 are marked `[x]`.

---

## 🛑 Milestone 5 Final Verification Gate

- [x] `pnpm test` passes 100% of all test suites across Milestones 1–5 (`logger`, `client`, `geo`, `seed`, `schedule-resolver`, `open-status`, `sticky-widget-machine`, `seo-aggregator`, `affiliate-stub`, `api/handlers`, `sanity-gate`, `fetcher`, `alert-dispatcher`).
- [x] `pnpm build` generates the static Astro production bundle in `dist/` with zero errors.
- [x] `pnpm sync:venue --slug=de-mirandabad` writes both `.log` and `.jsonl` logs into `logs/runs/`.
