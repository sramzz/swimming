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
