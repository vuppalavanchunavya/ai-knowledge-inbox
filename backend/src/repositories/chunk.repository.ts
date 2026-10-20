import type { DatabaseSync } from 'node:sqlite';
import type { SearchableChunk, StoredChunk } from '../types/index.js';

export class ChunkRepository {
  constructor(private readonly db: DatabaseSync) {}

  replaceForItem(itemId: string, chunks: StoredChunk[]): void {
    this.db.prepare('DELETE FROM chunks WHERE item_id = ?').run(itemId);
    const insert = this.db.prepare(
      `INSERT INTO chunks (id, item_id, chunk_index, content, embedding, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const chunk of chunks) {
      insert.run(chunk.id, chunk.itemId, chunk.chunkIndex, chunk.content, chunk.embedding, chunk.createdAt);
    }
  }

  deleteByItemId(itemId: string): void {
    this.db.prepare('DELETE FROM chunks WHERE item_id = ?').run(itemId);
  }

  countByItemId(itemId: string): number {
    const row = this.db.prepare('SELECT COUNT(*) AS total FROM chunks WHERE item_id = ?').get(itemId) as unknown as {
      total: number;
    };
    return row.total;
  }

  countSearchable(): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM chunks c
         JOIN items i ON i.id = c.item_id
         WHERE i.ingestion_status = 'completed'`,
      )
      .get() as unknown as { total: number };
    return row.total;
  }

  listSearchable(): SearchableChunk[] {
    const rows = this.db
      .prepare(
        `SELECT
           c.id AS chunk_id,
           c.item_id,
           c.chunk_index,
           c.content,
           c.embedding,
           i.title,
           i.source_type,
           i.original_url
         FROM chunks c
         JOIN items i ON i.id = c.item_id
         WHERE i.ingestion_status = 'completed'
         ORDER BY i.created_at ASC, c.chunk_index ASC`,
      )
      .all() as unknown as Array<{
      chunk_id: string;
      item_id: string;
      chunk_index: number;
      content: string;
      embedding: string;
      title: string;
      source_type: 'note' | 'url';
      original_url: string | null;
    }>;

    return rows.map((row) => ({
      chunkId: row.chunk_id,
      itemId: row.item_id,
      chunkIndex: row.chunk_index,
      content: row.content,
      embeddingJson: row.embedding,
      title: row.title,
      sourceType: row.source_type,
      originalUrl: row.original_url,
    }));
  }
}
