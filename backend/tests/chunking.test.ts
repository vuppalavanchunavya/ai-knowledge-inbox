import { describe, expect, it } from 'vitest';
import { chunkByCharacters, chunkText } from '../src/services/chunking.service.js';

describe('chunking', () => {
  it('keeps short paragraphs together and drops empty input', () => {
    expect(chunkByCharacters('   ', 100, 10)).toEqual([]);
    expect(chunkByCharacters('Alpha paragraph.\n\nBeta paragraph.', 200, 20)).toEqual([
      'Alpha paragraph.\n\nBeta paragraph.',
    ]);
  });

  it('splits long text and overlaps the previous chunk without copying the whole document', () => {
    const chunks = chunkByCharacters('x'.repeat(100), 40, 10);
    expect(chunks[0]).toBe('x'.repeat(40));
    expect(chunks[1]?.startsWith('x'.repeat(10))).toBe(true);
    expect(chunks[1]).toContain('x'.repeat(40));
    expect(chunks.every((chunk) => chunk.trim().length > 0)).toBe(true);
    expect(chunks.every((chunk) => chunk.length < 100)).toBe(true);
  });

  it('preserves word overlap between neighboring chunks', () => {
    const chunks = chunkByCharacters('alpha '.repeat(40).trim(), 80, 20);
    expect(chunks.length).toBeGreaterThan(1);
    const tail = chunks[0].slice(-8).trim();
    expect(chunks[1]).toContain(tail);
    expect(chunks[0].startsWith('alpha')).toBe(true);
  });

  it('is deterministic for the token-based entry point', () => {
    const text = 'React Hooks allow functional components to use state.\n\nThey are called at the top level.';
    expect(chunkText(text, { chunkSizeTokens: 50, overlapTokens: 10 })).toEqual(
      chunkText(text, { chunkSizeTokens: 50, overlapTokens: 10 }),
    );
    expect(chunkText(text, { chunkSizeTokens: 50, overlapTokens: 10 })[0]).toContain('React Hooks');
  });
});
