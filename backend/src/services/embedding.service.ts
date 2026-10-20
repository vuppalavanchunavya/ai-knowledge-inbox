import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

export function assertValidEmbedding(vector: unknown): number[] {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new AppError(502, 'EMBEDDING_FAILED', 'The embedding service returned an invalid vector.');
  }
  const numbers: number[] = [];
  for (const value of vector) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new AppError(502, 'EMBEDDING_FAILED', 'The embedding service returned a non-numeric vector.');
    }
    numbers.push(value);
  }
  return numbers;
}

interface EmbeddingResponse {
  data?: Array<{ index?: number; embedding?: unknown }>;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl: string;
      model: string;
      timeoutMs: number;
      batchSize: number;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    this.requireKey();
    const vectors: number[][] = [];
    const started = Date.now();
    try {
      for (let index = 0; index < texts.length; index += this.options.batchSize) {
        const batch = texts.slice(index, index + this.options.batchSize);
        const batchVectors = await this.embedBatch(batch);
        vectors.push(...batchVectors);
      }
    } catch (error) {
      logger.error('embedding.failed', {
        model: this.options.model,
        code: error instanceof AppError ? error.code : 'EMBEDDING_FAILED',
      });
      throw error;
    }
    logger.info('embedding.completed', {
      model: this.options.model,
      count: vectors.length,
      durationMs: Date.now() - started,
    });
    return vectors;
  }

  private requireKey(): void {
    if (!this.options.apiKey) {
      throw new AppError(503, 'AI_NOT_CONFIGURED', 'Set OPENAI_API_KEY before saving content or asking questions.');
    }
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    const payload = await this.postJson('/embeddings', {
      model: this.options.model,
      input: texts,
    });
    const body = payload as EmbeddingResponse;
    if (!Array.isArray(body.data) || body.data.length !== texts.length) {
      throw new AppError(502, 'EMBEDDING_FAILED', 'The embedding service returned an unexpected response.');
    }
    const ordered = [...body.data].sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
    const vectors = ordered.map((row) => assertValidEmbedding(row.embedding));
    const dimension = vectors[0]?.length ?? 0;
    if (vectors.some((vector) => vector.length !== dimension)) {
      throw new AppError(502, 'EMBEDDING_FAILED', 'The embedding service returned vectors of mixed sizes.');
    }
    return vectors;
  }

  private async postJson(path: string, body: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const fetchImpl = this.options.fetchImpl ?? fetch;
    try {
      const response = await fetchImpl(`${this.options.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.status === 429) {
        throw new AppError(429, 'RATE_LIMITED', 'The embedding service is rate limiting requests. Try again shortly.');
      }
      if (!response.ok) {
        throw new AppError(502, 'EMBEDDING_FAILED', 'The embedding service could not index this content.');
      }
      return await response.json();
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError(502, 'EMBEDDING_TIMEOUT', 'The embedding service timed out.');
      }
      throw new AppError(502, 'EMBEDDING_FAILED', 'The embedding service could not be reached.');
    } finally {
      clearTimeout(timer);
    }
  }
}
