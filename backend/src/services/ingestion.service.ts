import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from '../config/env.js';
import { withTransaction } from '../database/connection.js';
import { ChunkRepository } from '../repositories/chunk.repository.js';
import { ItemRepository, toPublicItem } from '../repositories/item.repository.js';
import { MetaRepository } from '../repositories/meta.repository.js';
import type { PublicItem, StoredChunk } from '../types/index.js';
import { AppError, isAppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { normalizeText } from '../utils/text.js';
import { chunkText } from './chunking.service.js';
import type { EmbeddingProvider } from './embedding.service.js';
import { assertValidEmbedding } from './embedding.service.js';
import type { WebpageService } from './webpage.service.js';

const FAILURE_STATUSES = new Set([413, 415, 422, 502, 503, 429]);

export class IngestionService {
  private readonly items: ItemRepository;
  private readonly chunks: ChunkRepository;
  private readonly meta: MetaRepository;

  constructor(
    private readonly db: DatabaseSync,
    private readonly config: AppConfig,
    private readonly embeddings: EmbeddingProvider,
    private readonly webpage: WebpageService,
  ) {
    this.items = new ItemRepository(db);
    this.chunks = new ChunkRepository(db);
    this.meta = new MetaRepository(db);
  }

  async ingestNote(input: { title: string; content: string }): Promise<PublicItem> {
    const title = normalizeText(input.title).slice(0, this.config.maxTitleChars);
    const content = normalizeText(input.content);
    if (!title || !content) {
      throw new AppError(400, 'VALIDATION_ERROR', 'A title and note content are required.');
    }
    if (content.length > this.config.maxNoteChars) {
      throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'The note is too long to save.');
    }
    const item = this.insertItem({
      title,
      sourceType: 'note',
      originalUrl: null,
      rawContent: content,
      status: 'processing',
      errorMessage: null,
    });
    try {
      await this.indexItem(item.id, content);
      return this.requirePublic(item.id);
    } catch (error) {
      this.failItem(item.id, error);
      throw error;
    }
  }

  async ingestUrl(input: { url: string }): Promise<PublicItem> {
    let fetched: { title: string; text: string; finalUrl: string };
    try {
      fetched = await this.webpage.fetchReadable(input.url);
    } catch (error) {
      if (isAppError(error) && FAILURE_STATUSES.has(error.statusCode)) {
        const failed = this.insertItem({
          title: safeTitleFromUrl(input.url),
          sourceType: 'url',
          originalUrl: input.url.trim(),
          rawContent: '',
          status: 'failed',
          errorMessage: error.message,
        });
        logger.error('ingestion.failed', { itemId: failed.id, code: error.code, sourceType: 'url' });
      }
      throw error;
    }

    if (fetched.text.length > this.config.maxExtractedChars) {
      const error = new AppError(413, 'RESPONSE_TOO_LARGE', 'The extracted page is larger than the allowed size.');
      this.insertItem({
        title: normalizeText(fetched.title).slice(0, this.config.maxTitleChars) || safeTitleFromUrl(fetched.finalUrl),
        sourceType: 'url',
        originalUrl: fetched.finalUrl,
        rawContent: '',
        status: 'failed',
        errorMessage: error.message,
      });
      throw error;
    }

    const title = normalizeText(fetched.title).slice(0, this.config.maxTitleChars) || safeTitleFromUrl(fetched.finalUrl);
    const item = this.insertItem({
      title,
      sourceType: 'url',
      originalUrl: fetched.finalUrl,
      rawContent: fetched.text,
      status: 'processing',
      errorMessage: null,
    });
    try {
      await this.indexItem(item.id, fetched.text);
      return this.requirePublic(item.id);
    } catch (error) {
      this.failItem(item.id, error);
      throw error;
    }
  }

  private async indexItem(itemId: string, content: string): Promise<void> {
    const parts = chunkText(content, {
      chunkSizeTokens: this.config.chunkSize,
      overlapTokens: this.config.chunkOverlap,
    });
    if (parts.length === 0) {
      throw new AppError(422, 'NO_READABLE_CONTENT', 'The content did not produce any searchable text.');
    }
    logger.info('chunking.completed', { itemId, chunkCount: parts.length });
    const vectors = await this.embeddings.embed(parts);
    if (vectors.length !== parts.length) {
      throw new AppError(502, 'EMBEDDING_FAILED', 'The embedding service returned an unexpected number of vectors.');
    }
    const validated = vectors.map((vector) => assertValidEmbedding(vector));
    const dimension = validated[0].length;
    if (validated.some((vector) => vector.length !== dimension)) {
      throw new AppError(502, 'EMBEDDING_FAILED', 'The embedding service returned vectors of mixed sizes.');
    }
    this.meta.assertCompatible(this.config.openaiEmbeddingModel, dimension);
    const createdAt = new Date().toISOString();
    const stored: StoredChunk[] = parts.map((part, index) => ({
      id: randomUUID(),
      itemId,
      chunkIndex: index,
      content: part,
      embedding: JSON.stringify(validated[index]),
      createdAt,
    }));
    withTransaction(this.db, () => {
      this.chunks.replaceForItem(itemId, stored);
      this.meta.recordEmbeddingModel(this.config.openaiEmbeddingModel, dimension);
      this.items.updateStatus(itemId, 'completed', null);
    });
    logger.info('ingestion.completed', { itemId, chunkCount: stored.length });
  }

  private insertItem(input: {
    title: string;
    sourceType: 'note' | 'url';
    originalUrl: string | null;
    rawContent: string;
    status: 'processing' | 'failed';
    errorMessage: string | null;
  }): PublicItem {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.items.insert({
      id,
      title: input.title,
      sourceType: input.sourceType,
      originalUrl: input.originalUrl,
      rawContent: input.rawContent,
      createdAt: now,
      updatedAt: now,
      ingestionStatus: input.status,
      errorMessage: input.errorMessage,
    });
    logger.info('item.created', { itemId: id, sourceType: input.sourceType, status: input.status });
    return this.requirePublic(id);
  }

  private failItem(itemId: string, error: unknown): void {
    this.chunks.deleteByItemId(itemId);
    const message = isAppError(error) ? error.message : 'Ingestion failed before the item could be indexed.';
    const code = isAppError(error) ? error.code : 'INGESTION_FAILED';
    this.items.updateStatus(itemId, 'failed', message);
    logger.error('ingestion.failed', { itemId, code });
  }

  private requirePublic(id: string): PublicItem {
    const item = this.items.findById(id);
    if (!item) {
      throw new AppError(500, 'INTERNAL_ERROR', 'The saved item could not be reloaded.');
    }
    return toPublicItem(item);
  }
}

function safeTitleFromUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return url.hostname || 'Saved page';
  } catch {
    return 'Saved page';
  }
}
