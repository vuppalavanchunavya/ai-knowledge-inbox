import type { AnswerResult, ItemsData, KnowledgeItem } from '../types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Could not reach the server. Check that the backend is running.', 0);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('BAD_RESPONSE', 'The server returned an unreadable response.', response.status);
  }

  if (!response.ok || !isSuccess<T>(payload)) {
    if (isError(payload)) {
      throw new ApiError(payload.error.code, payload.error.message, response.status);
    }
    throw new ApiError('REQUEST_FAILED', 'The request failed.', response.status);
  }
  return payload.data;
}

function isSuccess<T>(payload: unknown): payload is SuccessEnvelope<T> {
  return Boolean(payload && typeof payload === 'object' && (payload as { success?: unknown }).success === true);
}

function isError(payload: unknown): payload is ErrorEnvelope {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const error = (payload as { error?: { code?: unknown; message?: unknown } }).error;
  return Boolean(error && typeof error.code === 'string' && typeof error.message === 'string');
}

export const api = {
  listItems(params: { limit: number; offset: number; sourceType?: 'note' | 'url' }): Promise<ItemsData> {
    const search = new URLSearchParams({
      limit: String(params.limit),
      offset: String(params.offset),
    });
    if (params.sourceType) {
      search.set('sourceType', params.sourceType);
    }
    return request<ItemsData>(`/items?${search.toString()}`);
  },
  ingestNote(input: { title: string; content: string }): Promise<{ item: KnowledgeItem }> {
    return request('/ingest', { method: 'POST', body: JSON.stringify({ sourceType: 'note', ...input }) });
  },
  ingestUrl(input: { url: string }): Promise<{ item: KnowledgeItem }> {
    return request('/ingest', { method: 'POST', body: JSON.stringify({ sourceType: 'url', ...input }) });
  },
  query(input: { question: string; topK?: number }): Promise<AnswerResult> {
    return request('/query', { method: 'POST', body: JSON.stringify(input) });
  },
};
