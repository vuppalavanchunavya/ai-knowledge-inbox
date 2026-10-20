import dotenv from 'dotenv';
dotenv.config({ override: true });
import { loadConfig } from './config/env.js';
import { createApp } from './app.js';
import { openDatabase } from './database/connection.js';
import { OpenAIChatProvider } from './services/chat.service.js';
import { OpenAIEmbeddingProvider } from './services/embedding.service.js';
import { logger } from './utils/logger.js';
import { createDefaultHostResolver, createPinnedRequester, WebpageService } from './services/webpage.service.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const embeddings = new OpenAIEmbeddingProvider({
  apiKey: config.openaiApiKey,
  baseUrl: config.openaiBaseUrl,
  model: config.openaiEmbeddingModel,
  timeoutMs: config.requestTimeoutMs,
  batchSize: config.embeddingBatchSize,
});
const chat = new OpenAIChatProvider({
  apiKey: config.openaiApiKey,
  baseUrl: config.openaiBaseUrl,
  model: config.openaiChatModel,
  timeoutMs: config.requestTimeoutMs,
  maxTokens: config.chatMaxTokens,
});
const webpage = new WebpageService({
  resolveHost: createDefaultHostResolver(),
  request: createPinnedRequester(),
  timeoutMs: config.requestTimeoutMs,
  maxBytes: config.maxUrlBytes,
});

const app = createApp({ config, db, embeddings, chat, webpage });

app.listen(config.port, () => {
  logger.info('server.started', { port: config.port });
});
