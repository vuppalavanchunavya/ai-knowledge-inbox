import cors from 'cors';
import express, { type Express } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from './config/env.js';
import { createHealthHandler } from './controllers/health.controller.js';
import { createIngestHandler } from './controllers/ingest.controller.js';
import { createItemsHandler } from './controllers/items.controller.js';
import { createQueryHandler } from './controllers/query.controller.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { asyncHandler, requestContext } from './middleware/requestContext.js';
import { ChunkRepository } from './repositories/chunk.repository.js';
import { MetaRepository } from './repositories/meta.repository.js';
import type { ChatProvider } from './services/chat.service.js';
import type { EmbeddingProvider } from './services/embedding.service.js';
import { IngestionService } from './services/ingestion.service.js';
import { RagService } from './services/rag.service.js';
import type { WebpageService } from './services/webpage.service.js';

export interface AppDeps {
  config: AppConfig;
  db: DatabaseSync;
  embeddings: EmbeddingProvider;
  chat: ChatProvider;
  webpage: WebpageService;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: deps.config.frontendOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestContext);

  const ingestion = new IngestionService(deps.db, deps.config, deps.embeddings, deps.webpage);
  const rag = new RagService({
    config: deps.config,
    embeddings: deps.embeddings,
    chat: deps.chat,
    chunks: new ChunkRepository(deps.db),
    meta: new MetaRepository(deps.db),
  });

  app.get('/health', createHealthHandler(deps.db));
  app.post('/ingest', asyncHandler(createIngestHandler(ingestion, deps.config)));
  app.get('/items', asyncHandler(createItemsHandler(deps.db)));
  app.post('/query', asyncHandler(createQueryHandler(rag, deps.config)));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
