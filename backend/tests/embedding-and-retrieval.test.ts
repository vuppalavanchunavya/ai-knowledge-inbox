import { describe, expect, it, vi } from 'vitest';
import { OpenAIEmbeddingProvider } from '../src/services/embedding.service.js';
import { cosineSimilarity, parseStoredEmbedding, rankByCosine } from '../src/services/retrieval.service.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('embeddings', () => {
  it('sorts vectors by index, batches requests, and rejects invalid payloads', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { input: string[] };
      return jsonResponse({
        data: body.input.map((text, index) => ({
          index: body.input.length - 1 - index,
          embedding: text === 'bad' ? [1, Number.NaN] : [index + 1, 0],
        })),
      });
    });
    const provider = new OpenAIEmbeddingProvider({
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      model: 'text-embedding-3-small',
      timeoutMs: 1000,
      batchSize: 1,
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(provider.embed(['first', 'second'])).resolves.toEqual([
      [1, 0],
      [1, 0],
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const firstCall = fetchImpl.mock.calls[0]?.[1];
    expect(String(firstCall?.headers && (firstCall.headers as Record<string, string>).Authorization)).toContain('test-key');

    await expect(provider.embed(['bad'])).rejects.toMatchObject({ code: 'EMBEDDING_FAILED' });
  });

  it('maps rate limits, timeouts, and a missing key', async () => {
    const limited = new OpenAIEmbeddingProvider({
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      model: 'm',
      timeoutMs: 1000,
      batchSize: 8,
      fetchImpl: (async () => jsonResponse({ error: 'slow down' }, 429)) as typeof fetch,
    });
    await expect(limited.embed(['hello'])).rejects.toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });

    const timedOut = new OpenAIEmbeddingProvider({
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      model: 'm',
      timeoutMs: 1000,
      batchSize: 8,
      fetchImpl: (async () => {
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      }) as typeof fetch,
    });
    await expect(timedOut.embed(['hello'])).rejects.toMatchObject({ code: 'EMBEDDING_TIMEOUT' });

    const unconfigured = new OpenAIEmbeddingProvider({
      apiKey: '',
      baseUrl: 'https://example.test/v1',
      model: 'm',
      timeoutMs: 1000,
      batchSize: 8,
      fetchImpl: vi.fn() as typeof fetch,
    });
    await expect(unconfigured.embed(['hello'])).rejects.toMatchObject({ statusCode: 503, code: 'AI_NOT_CONFIGURED' });
  });
});

describe('cosine ranking', () => {
  it('ranks by similarity and skips zero vectors, bad dimensions, and low scores', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([0, 0], [1, 0])).toBeNull();
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBeNull();
    expect(cosineSimilarity([Number.NaN, 1], [1, 0])).toBeNull();

    const ranked = rankByCosine(
      [1, 0],
      [
        candidate('close', [1, 0], 'item-a'),
        candidate('orthogonal', [0, 1], 'item-b'),
        candidate('zero', [0, 0], 'item-c'),
        candidate('mismatch', [1, 0, 0], 'item-d'),
        candidate('mid', [0.8, 0.2], 'item-a'),
        candidate('also-close', [0.9, 0.1], 'item-e'),
      ],
      { topK: 2, minScore: 0.8, maxPerItem: 1 },
    );

    expect(ranked.map((chunk) => chunk.chunkId)).toEqual(['close', 'also-close']);
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
    expect(parseStoredEmbedding('[1,2]')).toEqual([1, 2]);
    expect(parseStoredEmbedding('{"nope":true}')).toBeNull();
    expect(parseStoredEmbedding('[1, null]')).toBeNull();
  });
});

function candidate(id: string, embedding: number[], itemId: string) {
  return {
    chunkId: id,
    itemId,
    chunkIndex: 0,
    content: id,
    embedding,
    title: id,
    sourceType: 'note' as const,
    url: null,
  };
}
