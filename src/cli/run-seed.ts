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
