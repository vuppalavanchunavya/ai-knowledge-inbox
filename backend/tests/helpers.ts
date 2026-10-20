import type { DatabaseSync } from 'node:sqlite';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config/env.js';
import { openDatabase } from '../src/database/connection.js';
import type { ChatMessage, ChatProvider } from '../src/services/chat.service.js';
import type { EmbeddingProvider } from '../src/services/embedding.service.js';
import { WebpageService, type PageRequest, type PageResponse } from '../src/services/webpage.service.js';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...loadConfig({
      OPENAI_API_KEY: 'test-key',
      DATABASE_PATH: ':memory:',
      CHUNK_SIZE: '50',
      CHUNK_OVERLAP: '10',
      RETRIEVAL_TOP_K: '5',
      RETRIEVAL_MIN_SCORE: '0.2',
      MAX_CHUNKS_PER_ITEM: '3',
    }),
    ...overrides,
  };
}

export function vectorFor(text: string): number[] {
  const normalized = text.toLowerCase();
  if (normalized.includes('react') || normalized.includes('hook')) {
    return [1, 0, 0];
  }
  if (normalized.includes('pasta') || normalized.includes('cook')) {
    return [0, 1, 0];
  }
  return [0, 0, 1];
}

export function createFakeEmbeddings(): EmbeddingProvider & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async embed(texts: string[]): Promise<number[][]> {
      calls.push(texts);
      return texts.map((text) => vectorFor(text));
    },
  };
}

export function createFakeChat(
  responder: (messages: ChatMessage[]) => string | Promise<string>,
): ChatProvider & { calls: ChatMessage[][] } {
  const calls: ChatMessage[][] = [];
  return {
    calls,
    async complete(messages: ChatMessage[]): Promise<string> {
      calls.push(messages);
      return responder(messages);
    },
  };
}

export function createWebpage(handler: (request: PageRequest) => PageResponse | Promise<PageResponse>): WebpageService {
  return new WebpageService({
    timeoutMs: 1000,
    maxBytes: 100_000,
    resolveHost: async (hostname: string) => {
      if (hostname === 'private.example') {
        return [{ address: '10.1.2.3', family: 4 }];
      }
      return [{ address: '93.184.216.34', family: 4 }];
    },
    request: handler,
  });
}

const SAMPLE_HTML = `<!doctype html>
<html>
  <head><title>Hooks Guide</title></head>
  <body>
    <script>secretScriptToken</script>
    <nav>NavigationMenuToken</nav>
    <article><p>React Hooks allow functional components to use state and other React features.</p></article>
  </body>
</html>`;

export function sampleWebpage(): WebpageService {
  return createWebpage(async () => ({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: Buffer.from(SAMPLE_HTML),
  }));
}

export function createTestApp(options: {
  config?: AppConfig;
  embeddings?: EmbeddingProvider;
  chat?: ChatProvider;
  webpage?: WebpageService;
  databasePath?: string;
} = {}): { app: Express; db: DatabaseSync; config: AppConfig } {
  const config = options.config ?? testConfig();
  const db = openDatabase(options.databasePath ?? ':memory:');
  const app = createApp({
    config,
    db,
    embeddings: options.embeddings ?? createFakeEmbeddings(),
    chat: options.chat ?? createFakeChat(async () => JSON.stringify({ answer: 'unused', citations: [] })),
    webpage: options.webpage ?? sampleWebpage(),
  });
  return { app, db, config };
}
