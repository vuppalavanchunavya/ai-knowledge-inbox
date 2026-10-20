import type { CitationSource, SearchableChunk, SourceType } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface RankedChunk {
  chunkId: string;
  itemId: string;
  chunkIndex: number;
  content: string;
  title: string;
  sourceType: SourceType;
  url: string | null;
  score: number;
}

interface Candidate {
  chunkId: string;
  itemId: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  title: string;
  sourceType: SourceType;
  url: string | null;
}

export function cosineSimilarity(left: number[], right: number[]): number | null {
  if (left.length === 0 || left.length !== right.length) {
    return null;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return null;
    }
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return null;
  }
  const score = dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
  if (!Number.isFinite(score)) {
    return null;
  }
  return score;
}

export function rankByCosine(
  query: number[],
  candidates: Candidate[],
  options: { topK: number; minScore: number; maxPerItem: number },
): RankedChunk[] {
  const scored: RankedChunk[] = [];
  for (const candidate of candidates) {
    const score = cosineSimilarity(query, candidate.embedding);
    if (score === null || score < options.minScore) {
      continue;
    }
    scored.push({
      chunkId: candidate.chunkId,
      itemId: candidate.itemId,
      chunkIndex: candidate.chunkIndex,
      content: candidate.content,
      title: candidate.title,
      sourceType: candidate.sourceType,
      url: candidate.url,
      score,
    });
  }
  scored.sort((left, right) => right.score - left.score || left.chunkIndex - right.chunkIndex);

  const selected: RankedChunk[] = [];
  const perItem = new Map<string, number>();
  for (const chunk of scored) {
    const used = perItem.get(chunk.itemId) ?? 0;
    if (used >= options.maxPerItem) {
      continue;
    }
    selected.push(chunk);
    perItem.set(chunk.itemId, used + 1);
    if (selected.length >= options.topK) {
      break;
    }
  }
  return selected;
}

export function parseStoredEmbedding(raw: string): number[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }
    const vector: number[] = [];
    for (const value of parsed) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
      }
      vector.push(value);
    }
    return vector;
  } catch {
    return null;
  }
}

export class RetrievalService {
  constructor(private readonly loadChunks: () => SearchableChunk[]) {}

  search(
    queryEmbedding: number[],
    options: { topK: number; minScore: number; maxPerItem: number },
  ): RankedChunk[] {
    const candidates: Candidate[] = [];
    for (const chunk of this.loadChunks()) {
      const embedding = parseStoredEmbedding(chunk.embeddingJson);
      if (!embedding) {
        logger.error('retrieval.skipped_chunk', { chunkId: chunk.chunkId, reason: 'invalid_embedding' });
        continue;
      }
      candidates.push({
        chunkId: chunk.chunkId,
        itemId: chunk.itemId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        embedding,
        title: chunk.title,
        sourceType: chunk.sourceType,
        url: chunk.originalUrl,
      });
    }
    const ranked = rankByCosine(queryEmbedding, candidates, options);
    logger.info('retrieval.completed', { candidates: candidates.length, selected: ranked.length });
    return ranked;
  }
}

export function toCitationSource(chunk: RankedChunk): CitationSource {
  return {
    itemId: chunk.itemId,
    chunkId: chunk.chunkId,
    title: chunk.title,
    sourceType: chunk.sourceType,
    url: chunk.url,
    snippet: snippet(chunk.content),
    score: roundScore(chunk.score),
  };
}

function snippet(content: string): string {
  const collapsed = content.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= 280) {
    return collapsed;
  }
  return `${collapsed.slice(0, 279).trimEnd()}…`;
}

function roundScore(score: number): number {
  return Math.round(score * 10000) / 10000;
}
