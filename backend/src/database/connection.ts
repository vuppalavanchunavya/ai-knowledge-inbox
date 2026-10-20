import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('note', 'url')),
  original_url TEXT,
  raw_content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  ingestion_status TEXT NOT NULL CHECK (ingestion_status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_items_created_at ON items (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_items_source_type ON items (source_type);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (item_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_item_id ON chunks (item_id);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function openDatabase(databasePath: string): DatabaseSync {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON');
  if (databasePath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
  }
  db.exec(SCHEMA);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE items
     SET ingestion_status = 'failed',
         error_message = 'Ingestion was interrupted before indexing finished.',
         updated_at = ?
     WHERE ingestion_status IN ('pending', 'processing')`,
  ).run(now);
  return db;
}

export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // The original error is the one that matters.
    }
    throw error;
  }
}
