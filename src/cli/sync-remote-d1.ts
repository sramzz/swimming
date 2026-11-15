import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { REQUIRED_CF_PROFILE, validateCfProfileConfig, type CfAuthProfileEntry } from './verify-cf-profile';

function sqlLiteral(val: unknown): string {
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

const rawProfiles = execSync('npx cf auth list', { encoding: 'utf-8' });
const jsonStart = rawProfiles.indexOf('[');
const profiles = (jsonStart >= 0 ? JSON.parse(rawProfiles.slice(jsonStart)) : []) as CfAuthProfileEntry[];
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
  (process.env.CF_D1_DATABASE_ID ? { uuid: process.env.CF_D1_DATABASE_ID, name: 'allezwembaden-db' } : null);

if (!targetDb) {
  console.error('❌ Could not find D1 database "allezwembaden-db" on profile "allezwembaden".');
  process.exit(1);
}

const legacyAlterStatements = [
  'ALTER TABLE postcode_pc4 ADD COLUMN woonplaats_id TEXT;',
  'ALTER TABLE venues ADD COLUMN zwemwater_metadata_json TEXT;',
  'ALTER TABLE venues ADD COLUMN woonplaats_id TEXT;',
  'ALTER TABLE venues ADD COLUMN woonplaats_slug TEXT;',
  'ALTER TABLE venues ADD COLUMN woonplaats_name TEXT;',
];

for (const alterSql of legacyAlterStatements) {
  try {
    execFileSync(
      'npx',
      [
        'cf',
        'd1',
        'query',
        targetDb.uuid,
        '--profile',
        REQUIRED_CF_PROFILE,
        '--body',
        JSON.stringify({ sql: alterSql }),
      ],
      { stdio: 'pipe' }
    );
  } catch {
    // Column already exists or table will be created cleanly by schema-detailed.sql
  }
}

const schemaSql = fs
  .readFileSync(path.resolve(process.cwd(), 'database-context/schema-detailed.sql'), 'utf-8')
  .replace(/PRAGMA\s+foreign_keys\s*=\s*ON;/gi, '')
  .replace(/PRAGMA\s+journal_mode\s*=\s*WAL;/gi, '')
  .replace(/--.*$/gm, '')
  .trim();

console.log(`Applying schema-detailed.sql to remote EU D1 (${targetDb.name})...`);
execFileSync(
  'npx',
  [
    'cf',
    'd1',
    'query',
    targetDb.uuid,
    '--profile',
    REQUIRED_CF_PROFILE,
    '--body',
    JSON.stringify({ sql: schemaSql }),
  ],
  { stdio: 'ignore' }
);

const sqlitePath = path.resolve(process.cwd(), 'data/allezwembaden.sqlite');
if (fs.existsSync(sqlitePath)) {
  const SYNC_TABLES = [
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
  ];

  const IGNORE_CONFLICT_TABLES = new Set(['lead_requests', 'outbound_click_daily_counts']);

  const localDb = new Database(sqlitePath, { readonly: true });
  const insertLines: string[] = [];

  for (const tableName of SYNC_TABLES) {
    const exists = localDb
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName);
    if (!exists) continue;

    const cols = (localDb.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{ name: string }>).map(
      (c) => c.name
    );
    if (cols.length === 0) continue;

    const colListSql = cols.map((c) => `"${c}"`).join(', ');
    const insertVerb = IGNORE_CONFLICT_TABLES.has(tableName) ? 'INSERT OR IGNORE' : 'INSERT OR REPLACE';
    const rows = localDb.prepare(`SELECT ${colListSql} FROM "${tableName}"`).all() as Array<Record<string, unknown>>;

    for (const row of rows) {
      const valuesSql = cols.map((col) => sqlLiteral(row[col])).join(', ');
      insertLines.push(`${insertVerb} INTO "${tableName}" (${colListSql}) VALUES (${valuesSql});`);
    }
  }

  localDb.close();

  if (insertLines.length > 0) {
    console.log(`Seeding ${insertLines.length} records into remote EU D1 (${targetDb.name})...`);
    const BATCH_SIZE = 50;
    const totalBatches = Math.ceil(insertLines.length / BATCH_SIZE);
    for (let i = 0; i < totalBatches; i++) {
      const batch = insertLines.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE).join('\n');
      process.stdout.write(`  Syncing batch ${i + 1}/${totalBatches}...\r`);
      try {
        execFileSync(
          'npx',
          [
            'cf',
            'd1',
            'query',
            targetDb.uuid,
            '--profile',
            REQUIRED_CF_PROFILE,
            '--body',
            JSON.stringify({ sql: batch }),
          ],
          { stdio: 'pipe' }
        );
      } catch (err) {
        const execErr = err as { stderr?: Buffer | string };
        const stderrText = execErr.stderr ? String(execErr.stderr) : '';
        console.error(`\n❌ Failed on batch ${i + 1}/${totalBatches}:\n${stderrText}`);
        throw err;
      }
    }
    console.log(`\n  All ${insertLines.length} records synchronized to D1.`);
  }
}

console.log(`✅ Remote EU D1 database (${targetDb.name}) schema and seed data synchronized!`);
