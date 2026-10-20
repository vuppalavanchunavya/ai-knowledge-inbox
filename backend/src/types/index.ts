export type SourceType = 'note' | 'url';
export type IngestionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ItemRecord {
  id: string;
  title: string;
  sourceType: SourceType;
  originalUrl: string | null;
  rawContent: string;
  createdAt: string;
  updatedAt: string;
  ingestionStatus: IngestionStatus;
  errorMessage: string | null;
}

export interface PublicItem {
  id: string;
  title: string;
  sourceType: SourceType;
  originalUrl: string | null;
  createdAt: string;
  updatedAt: string;
  status: IngestionStatus;
  errorMessage: string | null;
  preview: string;
}

export interface NewItem {
  id: string;
  title: string;
  sourceType: SourceType;
  originalUrl: string | null;
  rawContent: string;
  createdAt: string;
  updatedAt: string;
  ingestionStatus: IngestionStatus;
  errorMessage: string | null;
}

export interface StoredChunk {
  id: string;
  itemId: string;
  chunkIndex: number;
  content: string;
  embedding: string;
  createdAt: string;
}

export interface SearchableChunk {
  chunkId: string;
  itemId: string;
  chunkIndex: number;
  content: string;
  embeddingJson: string;
  title: string;
  sourceType: SourceType;
  originalUrl: string | null;
}

export interface CitationSource {
  itemId: string;
  chunkId: string;
  title: string;
  sourceType: SourceType;
  url: string | null;
  snippet: string;
  score: number;
}

export interface QueryResult {
  answer: string;
  sources: CitationSource[];
}
