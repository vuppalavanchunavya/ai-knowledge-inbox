export type SourceType = 'note' | 'url';
export type IngestionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface KnowledgeItem {
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

export interface Pagination {
  limit: number;
  offset: number;
  total: number;
}

export interface Citation {
  itemId: string;
  chunkId: string;
  title: string;
  sourceType: SourceType;
  url: string | null;
  snippet: string;
  score: number;
}

export interface AnswerResult {
  answer: string;
  sources: Citation[];
}

export interface ItemsData {
  items: KnowledgeItem[];
  pagination: Pagination;
}
