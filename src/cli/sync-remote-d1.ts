import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { REQUIRED_CF_PROFILE, validateCfProfileConfig, type CfAuthProfileEntry } from './verify-cf-profile';

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
  const dump = execFileSync('sqlite3', [sqlitePath, '.dump'], {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  });
  const insertLines = dump
    .split('\n')
    .filter((line) => line.startsWith('INSERT INTO '))
    .map((line) => line.replace(/^INSERT INTO /, 'INSERT OR IGNORE INTO '));

  if (insertLines.length > 0) {
    console.log(`Seeding ${insertLines.length} records into remote EU D1 (${targetDb.name})...`);
    const BATCH_SIZE = 60;
    const totalBatches = Math.ceil(insertLines.length / BATCH_SIZE);
    for (let i = 0; i < totalBatches; i++) {
      const batch = insertLines.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE).join('\n');
      process.stdout.write(`  Syncing batch ${i + 1}/${totalBatches}...\r`);
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
        { stdio: 'ignore' }
      );
    }
    console.log(`\n  All ${insertLines.length} records synchronized to D1.`);
  }
}

console.log(`✅ Remote EU D1 database (${targetDb.name}) schema and seed data synchronized!`);
