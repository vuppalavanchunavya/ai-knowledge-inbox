import type { DatabaseSync } from 'node:sqlite';
import type { IngestionStatus, ItemRecord, NewItem, PublicItem, SourceType } from '../types/index.js';
import { previewText } from '../utils/text.js';

interface ItemRow {
  id: string;
  title: string;
  source_type: SourceType;
  original_url: string | null;
  raw_content: string;
  created_at: string;
  updated_at: string;
  ingestion_status: IngestionStatus;
  error_message: string | null;
}

function mapItem(row: ItemRow): ItemRecord {
  return {
    id: row.id,
    title: row.title,
    sourceType: row.source_type,
    originalUrl: row.original_url,
    rawContent: row.raw_content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ingestionStatus: row.ingestion_status,
    errorMessage: row.error_message,
  };
}

export function toPublicItem(item: ItemRecord): PublicItem {
  return {
    id: item.id,
    title: item.title,
    sourceType: item.sourceType,
    originalUrl: item.originalUrl,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    status: item.ingestionStatus,
    errorMessage: item.errorMessage,
    preview: previewText(item.rawContent),
  };
}

export class ItemRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(item: NewItem): void {
    this.db
      .prepare(
        `INSERT INTO items (
           id, title, source_type, original_url, raw_content,
           created_at, updated_at, ingestion_status, error_message
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        item.id,
        item.title,
        item.sourceType,
        item.originalUrl,
        item.rawContent,
        item.createdAt,
        item.updatedAt,
        item.ingestionStatus,
        item.errorMessage,
      );
  }

  updateStatus(id: string, status: IngestionStatus, errorMessage: string | null): void {
    this.db
      .prepare(
        `UPDATE items
         SET ingestion_status = ?, error_message = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(status, errorMessage, new Date().toISOString(), id);
  }

  findById(id: string): ItemRecord | null {
    const row = this.db.prepare('SELECT * FROM items WHERE id = ?').get(id) as unknown as ItemRow | undefined;
    return row ? mapItem(row) : null;
  }

  list(options: { limit: number; offset: number; sourceType?: SourceType }): PublicItem[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM items
         WHERE (? IS NULL OR source_type = ?)
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(options.sourceType ?? null, options.sourceType ?? null, options.limit, options.offset) as unknown as ItemRow[];
    return rows.map((row) => toPublicItem(mapItem(row)));
  }

  count(sourceType?: SourceType): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS total FROM items WHERE (? IS NULL OR source_type = ?)')
      .get(sourceType ?? null, sourceType ?? null) as unknown as { total: number };
    return row.total;
  }
}
