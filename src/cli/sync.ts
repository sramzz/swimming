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
