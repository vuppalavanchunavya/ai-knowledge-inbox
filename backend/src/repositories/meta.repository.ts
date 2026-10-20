import type { DatabaseSync } from 'node:sqlite';
import { AppError } from '../utils/errors.js';

const MODEL_KEY = 'embedding_model';
const DIMENSION_KEY = 'embedding_dimensions';

export class MetaRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as unknown as { value: string } | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string): void {
    this.db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  assertCompatible(model: string, dimensions: number | null): void {
    const storedModel = this.get(MODEL_KEY);
    const storedDimensions = this.get(DIMENSION_KEY);
    if (!storedModel && !storedDimensions) {
      return;
    }
    if (storedModel && storedModel !== model) {
      throw new AppError(
        409,
        'EMBEDDING_MODEL_MISMATCH',
        `Saved embeddings were created with ${storedModel}. Reindex the knowledge base before using ${model}.`,
      );
    }
    if (dimensions !== null && storedDimensions && Number(storedDimensions) !== dimensions) {
      throw new AppError(
        409,
        'EMBEDDING_MODEL_MISMATCH',
        'Saved embeddings have a different vector size than the current embedding model. Reindex the knowledge base before querying.',
      );
    }
  }

  recordEmbeddingModel(model: string, dimensions: number): void {
    this.set(MODEL_KEY, model);
    this.set(DIMENSION_KEY, String(dimensions));
  }
}
