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
  // Pre-migration guard for existing SQLite databases created before new columns
  const existingTables = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(
      (t) => t.name
    )
  );

  if (existingTables.has('venues') || existingTables.has('postcode_pc4')) {
    // Ensure woonplaatsen exists before referencing it in legacy ALTER TABLE statements
    db.exec(`
      CREATE TABLE IF NOT EXISTS woonplaatsen (
          id                  TEXT PRIMARY KEY,
          bag_id              TEXT NOT NULL UNIQUE,
          slug                TEXT NOT NULL UNIQUE,
          name                TEXT NOT NULL,
          municipality_slug   TEXT NOT NULL REFERENCES municipalities(slug),
          province_slug       TEXT NOT NULL,
          center_lat          REAL NOT NULL,
          center_lng          REAL NOT NULL,
          updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      ) STRICT;
    `);

    if (existingTables.has('venues')) {
      const venueCols = new Set(
        (db.prepare('PRAGMA table_info(venues)').all() as Array<{ name: string }>).map((c) => c.name)
      );
      if (!venueCols.has('zwemwater_metadata_json')) {
        db.exec('ALTER TABLE venues ADD COLUMN zwemwater_metadata_json TEXT');
      }
      if (!venueCols.has('woonplaats_id')) {
        db.exec('ALTER TABLE venues ADD COLUMN woonplaats_id TEXT REFERENCES woonplaatsen(id)');
      }
      if (!venueCols.has('woonplaats_slug')) {
        db.exec('ALTER TABLE venues ADD COLUMN woonplaats_slug TEXT');
      }
      if (!venueCols.has('woonplaats_name')) {
        db.exec('ALTER TABLE venues ADD COLUMN woonplaats_name TEXT');
      }
    }

    if (existingTables.has('postcode_pc4')) {
      const pc4Cols = new Set(
        (db.prepare('PRAGMA table_info(postcode_pc4)').all() as Array<{ name: string }>).map((c) => c.name)
      );
      if (!pc4Cols.has('woonplaats_id')) {
        db.exec('ALTER TABLE postcode_pc4 ADD COLUMN woonplaats_id TEXT REFERENCES woonplaatsen(id)');
      }
    }
  }

  const sql = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(sql);
}
