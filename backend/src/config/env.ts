export interface AppConfig {
  port: number;
  nodeEnv: string;
  databasePath: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiChatModel: string;
  openaiEmbeddingModel: string;
  chunkSize: number;
  chunkOverlap: number;
  retrievalTopK: number;
  retrievalMinScore: number;
  maxChunksPerItem: number;
  maxUrlBytes: number;
  requestTimeoutMs: number;
  frontendOrigin: string;
  maxTitleChars: number;
  maxNoteChars: number;
  maxQuestionChars: number;
  maxExtractedChars: number;
  embeddingBatchSize: number;
  chatMaxTokens: number;
}

type EnvSource = Record<string, string | undefined>;

function readString(env: EnvSource, name: string, fallback: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  return value.trim();
}

function readInt(env: EnvSource, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function readFloat(env: EnvSource, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a number from ${min} to ${max}.`);
  }
  return value;
}

export function loadConfig(env: EnvSource = process.env): AppConfig {
  const chunkSize = readInt(env, 'CHUNK_SIZE', 500, 50, 4000);
  const chunkOverlap = readInt(env, 'CHUNK_OVERLAP', 75, 0, 1000);
  if (chunkOverlap >= chunkSize) {
    throw new Error('CHUNK_OVERLAP must be smaller than CHUNK_SIZE.');
  }

  return {
    port: readInt(env, 'PORT', 4000, 1, 65535),
    nodeEnv: readString(env, 'NODE_ENV', 'development'),
    databasePath: readString(env, 'DATABASE_PATH', './data/knowledge.db'),
    openaiApiKey: readString(env, 'OPENAI_API_KEY', ''),
    openaiBaseUrl: readString(env, 'OPENAI_BASE_URL', 'https://api.openai.com/v1').replace(/\/+$/, ''),
    openaiChatModel: readString(env, 'OPENAI_CHAT_MODEL', 'gpt-4o-mini'),
    openaiEmbeddingModel: readString(env, 'OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'),
    chunkSize,
    chunkOverlap,
    retrievalTopK: readInt(env, 'RETRIEVAL_TOP_K', 5, 1, 20),
    retrievalMinScore: readFloat(env, 'RETRIEVAL_MIN_SCORE', 0.25, 0, 1),
    maxChunksPerItem: readInt(env, 'MAX_CHUNKS_PER_ITEM', 3, 1, 10),
    maxUrlBytes: readInt(env, 'MAX_URL_BYTES', 2_000_000, 1_000, 10_000_000),
    requestTimeoutMs: readInt(env, 'REQUEST_TIMEOUT_MS', 10_000, 1_000, 60_000),
    frontendOrigin: readString(env, 'FRONTEND_ORIGIN', 'http://localhost:5173'),
    maxTitleChars: 200,
    maxNoteChars: 100_000,
    maxQuestionChars: 2_000,
    maxExtractedChars: 100_000,
    embeddingBatchSize: 32,
    chatMaxTokens: 800,
  };
}
