import { normalizeText } from '../utils/text.js';

/** Documented approximation: one token is treated as four characters. */
export const CHARS_PER_TOKEN = 4;

/**
 * Splits text into ordered chunks.
 * Paragraphs stay intact when they fit. Longer paragraphs break on sentences,
 * then words, then a hard character window. Overlap is a short suffix of the
 * previous base segment, never a copy of the whole document.
 */
export function chunkText(text: string, options: { chunkSizeTokens: number; overlapTokens: number }): string[] {
  const targetChars = Math.max(1, options.chunkSizeTokens * CHARS_PER_TOKEN);
  const requestedOverlap = Math.max(0, options.overlapTokens * CHARS_PER_TOKEN);
  const overlapChars = Math.min(requestedOverlap, Math.max(0, targetChars - 1));
  return chunkByCharacters(normalizeText(text), targetChars, overlapChars);
}

export function chunkByCharacters(text: string, targetChars: number, overlapChars: number): string[] {
  const cleaned = text.trim();
  if (!cleaned) {
    return [];
  }
  const target = Math.max(1, targetChars);
  const overlap = Math.max(0, Math.min(overlapChars, target - 1));
  const base = splitToTarget(cleaned, target);
  return applyOverlap(base, overlap);
}

function splitToTarget(text: string, target: number): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);

  let buffer = '';
  const flush = (): void => {
    const trimmed = buffer.trim();
    if (trimmed) {
      chunks.push(trimmed);
    }
    buffer = '';
  };

  for (const paragraph of paragraphs) {
    const units = paragraph.length <= target ? [paragraph] : splitOversized(paragraph, target);
    for (const unit of units) {
      if (!buffer) {
        buffer = unit;
        continue;
      }
      const combined = `${buffer}\n\n${unit}`;
      if (combined.length <= target) {
        buffer = combined;
        continue;
      }
      flush();
      buffer = unit;
    }
  }
  flush();
  return chunks;
}

function splitOversized(paragraph: string, target: number): string[] {
  const sentences = paragraph.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
  if (sentences.length > 1) {
    return packUnits(sentences, target, ' ');
  }
  const words = paragraph.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((word) => word.length <= target)) {
    return packUnits(words, target, ' ');
  }
  return hardSplit(paragraph, target);
}

function packUnits(units: string[], target: number, separator: string): string[] {
  const chunks: string[] = [];
  let buffer = '';
  for (const unit of units) {
    if (unit.length > target) {
      if (buffer) {
        chunks.push(buffer);
        buffer = '';
      }
      chunks.push(...hardSplit(unit, target));
      continue;
    }
    const next = buffer ? `${buffer}${separator}${unit}` : unit;
    if (next.length <= target) {
      buffer = next;
    } else {
      if (buffer) {
        chunks.push(buffer);
      }
      buffer = unit;
    }
  }
  if (buffer) {
    chunks.push(buffer);
  }
  return chunks;
}

function hardSplit(text: string, target: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += target) {
    const piece = text.slice(index, index + target).trim();
    if (piece) {
      chunks.push(piece);
    }
  }
  return chunks;
}

function applyOverlap(parts: string[], overlapChars: number): string[] {
  if (overlapChars <= 0) {
    return parts.filter((part) => part.trim().length > 0);
  }
  return parts
    .map((part, index) => {
      if (index === 0) {
        return part.trim();
      }
      const suffix = overlapSuffix(parts[index - 1], overlapChars);
      if (!suffix) {
        return part.trim();
      }
      return `${suffix} ${part}`.trim();
    })
    .filter((part) => part.length > 0);
}

function overlapSuffix(text: string, overlapChars: number): string {
  const trimmed = text.trim();
  if (overlapChars <= 0 || trimmed.length <= overlapChars) {
    return '';
  }
  let suffix = trimmed.slice(-overlapChars);
  const space = suffix.indexOf(' ');
  if (space >= 0 && space < suffix.length - 1) {
    suffix = suffix.slice(space + 1);
  }
  const result = suffix.trim();
  if (!result || result.length >= trimmed.length) {
    return '';
  }
  return result;
}
