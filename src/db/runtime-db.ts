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
