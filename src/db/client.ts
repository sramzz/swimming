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
