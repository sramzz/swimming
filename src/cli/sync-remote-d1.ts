import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import {
  REQUIRED_CF_PROFILE,
  validateCfProfileConfig,
  type CfAuthProfileEntry,
} from './verify-cf-profile';

export interface SyncCliOptions {
  generateOnly: boolean;
  deltaVenues: boolean;
}

export interface RemoteVenueSummary {
  id: string;
  name: string;
  slug: string;
  municipality_slug: string;
  woonplaats_slug: string | null;
  woonplaats_id: string | null;
}

export interface VenueDeltaPlan {
  deleteIds: string[];
  updatedIds: string[];
  insertedIds: string[];
  statements: string[];
}

export const SYNC_TABLES = [
  'municipalities',
  'woonplaatsen',
  'postcode_pc4',
  'swim_providers',
  'venues',
  'basins',
  'outdoor_conditions',
  'schedule_periods',
  'schedule_slots',
  'tariffs',
  'venue_swim_offerings',
  'waitlist_snapshots',
  'weather_alerts',
  'nl_public_holidays',
  'nl_school_vacations',
  'affiliate_product_stubs',
  'ingestion_runs',
  'quarantined_anomalies',
  'lead_requests',
  'outbound_click_daily_counts',
] as const;

const IGNORE_CONFLICT_TABLES = new Set(['lead_requests', 'outbound_click_daily_counts']);

const VENUE_CHILD_TABLES = [
  'basins',
  'outdoor_conditions',
  'schedule_periods',
  'tariffs',
  'venue_swim_offerings',
  'outbound_click_daily_counts',
  'data_provenance',
  'crowd_reports',
] as const;

const VENUE_UPDATE_COLUMNS = [
  'name',
  'slug',
  'municipality_slug',
  'woonplaats_slug',
  'woonplaats_id',
  'woonplaats_name',
  'content_hash',
  'lastmod_at',
] as const;

/**
 * Parses CLI flags for `sync-remote-d1.ts`.
 */
export function parseSyncCliArgs(argv: string[]): SyncCliOptions {
  return {
    generateOnly: argv.includes('--generate-only'),
    deltaVenues: argv.includes('--delta-venues'),
  };
}

/**
 * Escapes a JavaScript value as a safe SQLite SQL literal.
 */
export function sqlLiteral(val: unknown): string {
  if (val === null || val === undefined) {
    return 'NULL';
  }
  if (typeof val === 'number') {
    return Number.isFinite(val) ? String(val) : 'NULL';
  }
  if (typeof val === 'bigint') {
    return String(val);
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

function normalizeNullableString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return String(val);
}

/**
 * Computes a deterministic, FK-safe SQL delta plan between remote D1 `venues`
 * and local SQLite `venues`. Pure function (zero I/O).
 */
export function buildVenueDeltaPlan(params: {
  remoteVenues: RemoteVenueSummary[];
  localVenues: Array<Record<string, unknown>>;
  venueColumns: string[];
  existingRemoteTables: Set<string>;
}): VenueDeltaPlan {
  const { remoteVenues, localVenues, venueColumns, existingRemoteTables } = params;

  const remoteMap = new Map<string, RemoteVenueSummary>();
  for (const r of remoteVenues) {
    remoteMap.set(r.id, r);
  }

  const localMap = new Map<string, Record<string, unknown>>();
  for (const l of localVenues) {
    const id = String(l.id);
    localMap.set(id, l);
  }

  const deleteIds = remoteVenues
    .filter((r) => !localMap.has(r.id))
    .map((r) => r.id)
    .sort();

  const updatedRows: Array<Record<string, unknown>> = [];
  const insertedRows: Array<Record<string, unknown>> = [];

  const sortedLocal = [...localVenues].sort((a, b) =>
    String(a.id).localeCompare(String(b.id))
  );

  for (const localRow of sortedLocal) {
    const id = String(localRow.id);
    const remoteRow = remoteMap.get(id);
    if (!remoteRow) {
      insertedRows.push(localRow);
      continue;
    }

    const differs =
      remoteRow.name !== String(localRow.name) ||
      remoteRow.slug !== String(localRow.slug) ||
      remoteRow.municipality_slug !== String(localRow.municipality_slug) ||
      normalizeNullableString(remoteRow.woonplaats_slug) !==
        normalizeNullableString(localRow.woonplaats_slug) ||
      normalizeNullableString(remoteRow.woonplaats_id) !==
        normalizeNullableString(localRow.woonplaats_id);

    if (differs) {
      updatedRows.push(localRow);
    }
  }

  const statements: string[] = [];

  // 1. Emit DELETE statements first (children -> parent) so UNIQUE (municipality_slug, slug) cannot collide with later UPDATEs
  for (const id of deleteIds) {
    const idLit = sqlLiteral(id);

    if (
      existingRemoteTables.has('waitlist_snapshots') &&
      existingRemoteTables.has('venue_swim_offerings')
    ) {
      statements.push(
        `DELETE FROM "waitlist_snapshots" WHERE "offering_id" IN (SELECT "id" FROM "venue_swim_offerings" WHERE "venue_id" = ${idLit});`
      );
    }
    if (
      existingRemoteTables.has('schedule_slots') &&
      existingRemoteTables.has('schedule_periods')
    ) {
      statements.push(
        `DELETE FROM "schedule_slots" WHERE "schedule_period_id" IN (SELECT "id" FROM "schedule_periods" WHERE "venue_id" = ${idLit});`
      );
    }
    if (existingRemoteTables.has('schedule_slots') && existingRemoteTables.has('basins')) {
      statements.push(
        `UPDATE "schedule_slots" SET "basin_id" = NULL WHERE "basin_id" IN (SELECT "id" FROM "basins" WHERE "venue_id" = ${idLit});`
      );
    }

    for (const childTable of VENUE_CHILD_TABLES) {
      if (existingRemoteTables.has(childTable)) {
        statements.push(`DELETE FROM "${childTable}" WHERE "venue_id" = ${idLit};`);
      }
    }

    if (existingRemoteTables.has('lead_requests')) {
      statements.push(
        `UPDATE "lead_requests" SET "source_venue_id" = NULL WHERE "source_venue_id" = ${idLit};`
      );
    }

    statements.push(`DELETE FROM "venues" WHERE "id" = ${idLit};`);
  }

  // 2. Emit surgical UPDATE statements for modified venues
  const availableColSet = new Set(venueColumns);
  const updateCols = VENUE_UPDATE_COLUMNS.filter((c) => availableColSet.has(c));

  for (const row of updatedRows) {
    const idLit = sqlLiteral(row.id);
    const setClauses = updateCols.map((col) => `"${col}" = ${sqlLiteral(row[col])}`).join(', ');
    statements.push(`UPDATE "venues" SET ${setClauses} WHERE "id" = ${idLit};`);
  }

  // 3. Emit explicit-column INSERT OR REPLACE statements for newly added venues
  const colListSql = venueColumns.map((c) => `"${c}"`).join(', ');
  for (const row of insertedRows) {
    const valuesSql = venueColumns.map((col) => sqlLiteral(row[col])).join(', ');
    statements.push(`INSERT OR REPLACE INTO "venues" (${colListSql}) VALUES (${valuesSql});`);
  }

  return {
    deleteIds,
    updatedIds: updatedRows.map((r) => String(r.id)),
    insertedIds: insertedRows.map((r) => String(r.id)),
    statements,
  };
}

function resolveTargetD1Database(): { uuid: string; name: string } {
  const rawProfiles = execSync('npx cf auth list', { encoding: 'utf-8' });
  const jsonStart = rawProfiles.indexOf('[');
  const profiles = (
    jsonStart >= 0 ? JSON.parse(rawProfiles.slice(jsonStart)) : []
  ) as CfAuthProfileEntry[];
  const profileCheck = validateCfProfileConfig(profiles, process.cwd());

  if (!profileCheck.ok) {
    console.error(profileCheck.errorMessage);
    process.exit(1);
  }

  const d1ListRaw = execFileSync('npx', ['cf', 'd1', 'list', '--profile', REQUIRED_CF_PROFILE], {
    encoding: 'utf-8',
  });
  const d1JsonStart = d1ListRaw.indexOf('[');
  const d1List = (
    d1JsonStart >= 0 ? JSON.parse(d1ListRaw.slice(d1JsonStart)) : []
  ) as Array<{ uuid: string; name: string }>;

  const targetDb =
    d1List.find((d) => d.name === 'allezwembaden-db') ??
    (process.env.CF_D1_DATABASE_ID
      ? { uuid: process.env.CF_D1_DATABASE_ID, name: 'allezwembaden-db' }
      : null);

  if (!targetDb) {
    console.error('❌ Could not find D1 database "allezwembaden-db" on profile "allezwembaden".');
    process.exit(1);
  }

  return targetDb;
}

function queryRemoteD1<T>(databaseId: string, sql: string): T[] {
  const raw = execFileSync(
    'npx',
    [
      'cf',
      'd1',
      'query',
      databaseId,
      '--profile',
      REQUIRED_CF_PROFILE,
      '--quiet',
      '--body',
      JSON.stringify({ sql }),
    ],
    { encoding: 'utf-8', maxBuffer: 25 * 1024 * 1024 }
  );
  const jsonStart = raw.indexOf('[');
  if (jsonStart < 0) {
    throw new Error(`Unexpected cf d1 query response: ${raw}`);
  }
  const parsed = JSON.parse(raw.slice(jsonStart)) as Array<{
    results?: T[];
    success?: boolean;
  }>;
  return parsed[0]?.results ?? [];
}

function executeRemoteD1Batch(databaseId: string, sql: string): void {
  execFileSync(
    'npx',
    [
      'cf',
      'd1',
      'query',
      databaseId,
      '--profile',
      REQUIRED_CF_PROFILE,
      '--quiet',
      '--body',
      JSON.stringify({ sql }),
    ],
    { stdio: 'pipe' }
  );
}

function runDeltaVenuesSync(sqlitePath: string, generateOnly: boolean): void {
  if (!fs.existsSync(sqlitePath)) {
    console.error(`❌ Local SQLite database not found at ${sqlitePath}`);
    process.exit(1);
  }

  const targetDb = resolveTargetD1Database();
  console.log(`Querying remote EU D1 (${targetDb.name}) read-only for venue delta comparison...`);

  const remoteTableRows = queryRemoteD1<{ name: string }>(
    targetDb.uuid,
    "SELECT name FROM sqlite_master WHERE type = 'table';"
  );
  const existingRemoteTables = new Set(remoteTableRows.map((r) => r.name));

  const remoteVenues = queryRemoteD1<RemoteVenueSummary>(
    targetDb.uuid,
    'SELECT id, name, slug, municipality_slug, woonplaats_slug, woonplaats_id FROM venues;'
  );

  const localDb = new Database(sqlitePath, { readonly: true });
  const venueColumns = (
    localDb.prepare('PRAGMA table_info("venues")').all() as Array<{ name: string }>
  ).map((c) => c.name);
  const colListSql = venueColumns.map((c) => `"${c}"`).join(', ');
  const localVenues = localDb
    .prepare(`SELECT ${colListSql} FROM "venues"`)
    .all() as Array<Record<string, unknown>>;
  localDb.close();

  const plan = buildVenueDeltaPlan({
    remoteVenues,
    localVenues,
    venueColumns,
    existingRemoteTables,
  });

  const wranglerDir = path.resolve(process.cwd(), '.wrangler');
  fs.mkdirSync(wranglerDir, { recursive: true });
  const deltaSqlPath = path.join(wranglerDir, 'd1-delta-sync.sql');

  const headerLines = [
    '-- Zwemkaart.nl Surgical Remote D1 Venue Delta Sync',
    `-- Generated at: ${new Date().toISOString()}`,
    `-- Remote venues: ${remoteVenues.length} | Local venues: ${localVenues.length}`,
    `-- Deletes: ${plan.deleteIds.length} | Updates: ${plan.updatedIds.length} | Inserts: ${plan.insertedIds.length}`,
    '',
  ];
  fs.writeFileSync(
    deltaSqlPath,
    [...headerLines, ...plan.statements, ''].join('\n'),
    'utf-8'
  );

  console.log(`Delta SQL written to ${path.relative(process.cwd(), deltaSqlPath)}`);
  console.log(
    `Delta summary — Deletes: ${plan.deleteIds.length}, Updates: ${plan.updatedIds.length}, Inserts: ${plan.insertedIds.length} (${plan.statements.length} SQL statements)`
  );

  if (
    plan.deleteIds.length === 0 &&
    plan.updatedIds.length === 0 &&
    plan.insertedIds.length === 0
  ) {
    console.log('✅ 0 deletes, 0 updates, 0 inserts — remote D1 is already in sync; skipping remote write.');
    return;
  }

  if (generateOnly) {
    console.log('✅ --generate-only set: skipped remote D1 execution.');
    return;
  }

  const BATCH_SIZE = 25;
  const totalBatches = Math.ceil(plan.statements.length / BATCH_SIZE);
  console.log(
    `Executing ${plan.statements.length} delta statements across ${totalBatches} batch(es) on remote D1 (${targetDb.name})...`
  );

  for (let i = 0; i < totalBatches; i++) {
    const batchSql = plan.statements.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE).join('\n');
    process.stdout.write(`  Executing delta batch ${i + 1}/${totalBatches}...\r`);
    try {
      executeRemoteD1Batch(targetDb.uuid, batchSql);
    } catch (err) {
      const execErr = err as { stderr?: Buffer | string };
      const stderrText = execErr.stderr ? String(execErr.stderr) : '';
      console.error(`\n❌ Failed on delta batch ${i + 1}/${totalBatches}:\n${stderrText}`);
      throw err;
    }
  }
  console.log(
    `\n✅ Surgical D1 venue delta synchronized (${plan.deleteIds.length} deletes, ${plan.updatedIds.length} updates, ${plan.insertedIds.length} inserts).`
  );
}

function buildLocalFullInsertStatements(sqlitePath: string): string[] {
  if (!fs.existsSync(sqlitePath)) {
    return [];
  }

  const localDb = new Database(sqlitePath, { readonly: true });
  const insertLines: string[] = [];

  for (const tableName of SYNC_TABLES) {
    const exists = localDb
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName);
    if (!exists) continue;

    const cols = (
      localDb.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{ name: string }>
    ).map((c) => c.name);
    if (cols.length === 0) continue;

    const colListSql = cols.map((c) => `"${c}"`).join(', ');
    const insertVerb = IGNORE_CONFLICT_TABLES.has(tableName)
      ? 'INSERT OR IGNORE'
      : 'INSERT OR REPLACE';
    const rows = localDb
      .prepare(`SELECT ${colListSql} FROM "${tableName}"`)
      .all() as Array<Record<string, unknown>>;

    for (const row of rows) {
      const valuesSql = cols.map((col) => sqlLiteral(row[col])).join(', ');
      insertLines.push(`${insertVerb} INTO "${tableName}" (${colListSql}) VALUES (${valuesSql});`);
    }
  }

  localDb.close();
  return insertLines;
}

function runFullSync(sqlitePath: string, generateOnly: boolean): void {
  const schemaSql = fs
    .readFileSync(path.resolve(process.cwd(), 'database-context/schema-detailed.sql'), 'utf-8')
    .replace(/PRAGMA\s+foreign_keys\s*=\s*ON;/gi, '')
    .replace(/PRAGMA\s+journal_mode\s*=\s*WAL;/gi, '')
    .replace(/--.*$/gm, '')
    .trim();

  const insertLines = buildLocalFullInsertStatements(sqlitePath);

  const wranglerDir = path.resolve(process.cwd(), '.wrangler');
  fs.mkdirSync(wranglerDir, { recursive: true });
  const fullSqlPath = path.join(wranglerDir, 'd1-full-sync.sql');
  fs.writeFileSync(
    fullSqlPath,
    [
      '-- Zwemkaart.nl Full D1 Schema & Seed SQL',
      `-- Generated at: ${new Date().toISOString()}`,
      `-- Insert statements: ${insertLines.length}`,
      '',
      schemaSql,
      '',
      ...insertLines,
      '',
    ].join('\n'),
    'utf-8'
  );

  if (generateOnly) {
    console.log(
      `✅ --generate-only set: wrote ${path.relative(process.cwd(), fullSqlPath)} (${insertLines.length} insert statements) without executing against remote D1.`
    );
    return;
  }

  const targetDb = resolveTargetD1Database();
  const legacyAlterStatements = [
    'ALTER TABLE postcode_pc4 ADD COLUMN woonplaats_id TEXT;',
    'ALTER TABLE venues ADD COLUMN zwemwater_metadata_json TEXT;',
    'ALTER TABLE venues ADD COLUMN woonplaats_id TEXT;',
    'ALTER TABLE venues ADD COLUMN woonplaats_slug TEXT;',
    'ALTER TABLE venues ADD COLUMN woonplaats_name TEXT;',
  ];

  for (const alterSql of legacyAlterStatements) {
    try {
      executeRemoteD1Batch(targetDb.uuid, alterSql);
    } catch {
      // Column already exists or table will be created cleanly by schema-detailed.sql
    }
  }

  console.log(`Applying schema-detailed.sql to remote EU D1 (${targetDb.name})...`);
  executeRemoteD1Batch(targetDb.uuid, schemaSql);

  if (insertLines.length > 0) {
    console.log(`Seeding ${insertLines.length} records into remote EU D1 (${targetDb.name})...`);
    const BATCH_SIZE = 50;
    const totalBatches = Math.ceil(insertLines.length / BATCH_SIZE);
    for (let i = 0; i < totalBatches; i++) {
      const batch = insertLines.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE).join('\n');
      process.stdout.write(`  Syncing batch ${i + 1}/${totalBatches}...\r`);
      try {
        executeRemoteD1Batch(targetDb.uuid, batch);
      } catch (err) {
        const execErr = err as { stderr?: Buffer | string };
        const stderrText = execErr.stderr ? String(execErr.stderr) : '';
        console.error(`\n❌ Failed on batch ${i + 1}/${totalBatches}:\n${stderrText}`);
        throw err;
      }
    }
    console.log(`\n  All ${insertLines.length} records synchronized to D1.`);
  }

  console.log(`✅ Remote EU D1 database (${targetDb.name}) schema and seed data synchronized!`);
}

/**
 * CLI orchestrator for full or surgical delta Cloudflare D1 synchronization.
 */
export function runSyncRemoteD1(argv: string[] = process.argv.slice(2)): void {
  const options = parseSyncCliArgs(argv);
  const sqlitePath = path.resolve(process.cwd(), 'data/allezwembaden.sqlite');

  if (options.deltaVenues) {
    runDeltaVenuesSync(sqlitePath, options.generateOnly);
  } else {
    runFullSync(sqlitePath, options.generateOnly);
  }
}

const isCliEntry =
  !process.env.VITEST &&
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCliEntry) {
  runSyncRemoteD1();
}
