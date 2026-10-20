import { describe, expect, it } from 'vitest';
import { INSUFFICIENT_ANSWER, parseModelAnswer, selectCitationIds } from '../src/services/rag.service.js';
import { OpenAIChatProvider } from '../src/services/chat.service.js';
import { AppError } from '../src/utils/errors.js';

describe('citation validation', () => {
  it('keeps only citations that were actually retrieved', () => {
    expect(selectCitationIds(['chunk-1', 'made-up', 'chunk-1', 'chunk-2'], new Set(['chunk-1']))).toEqual(['chunk-1']);
  });

  it('parses a fenced model response and ignores malformed citation entries', () => {
    const parsed = parseModelAnswer('```json\n{"answer":"Hooks store state.","citations":[{"chunkId":"chunk-1"},{"chunkId":1}]}\n```');
    expect(parsed).toEqual({ answer: 'Hooks store state.', citationIds: ['chunk-1'] });
    expect(() => parseModelAnswer('{"answer":"","citations":[]}')).toThrow(AppError);
  });

  it('uses a stable insufficient-evidence sentence', () => {
    expect(INSUFFICIENT_ANSWER).toMatch(/does not provide enough information/i);
  });
});

describe('chat provider failures', () => {
  it('hides provider details when the model request fails', async () => {
    const provider = new OpenAIChatProvider({
      apiKey: 'secret-key',
      baseUrl: 'https://example.test/v1',
      model: 'gpt-4o-mini',
      timeoutMs: 1000,
      maxTokens: 100,
      fetchImpl: (async () => new Response('upstream exploded: secret-key', { status: 500 })) as typeof fetch,
    });
    await expect(provider.complete([{ role: 'user', content: 'Hi' }])).rejects.toMatchObject({
      statusCode: 502,
      code: 'LLM_FAILED',
      message: 'The answer service could not complete this question.',
    });
  });
});
