import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { ChunkRepository } from '../src/repositories/chunk.repository.js';
import { ItemRepository } from '../src/repositories/item.repository.js';
import { AppError } from '../src/utils/errors.js';
import { INSUFFICIENT_ANSWER } from '../src/services/rag.service.js';
import { createFakeChat, createFakeEmbeddings, createTestApp, createWebpage, sampleWebpage, testConfig } from './helpers.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('POST /ingest notes', () => {
  it('saves a note, chunks it, and stores an embedding', async () => {
    const embeddings = createFakeEmbeddings();
    const { app, db } = createTestApp({ embeddings });
    const response = await request(app).post('/ingest').send({
      sourceType: 'note',
      title: 'React Hooks',
      content: 'React Hooks allow functional components to use state and other React features.',
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.item.status).toBe('completed');
    expect(response.body.data.item.title).toBe('React Hooks');
    expect(response.body.data.item.sourceType).toBe('note');
    expect(embeddings.calls[0]?.[0]).toContain('React Hooks');

    const chunks = new ChunkRepository(db);
    expect(chunks.countByItemId(response.body.data.item.id)).toBe(1);
    const stored = chunks.listSearchable()[0];
    expect(JSON.parse(stored.embeddingJson)).toEqual([1, 0, 0]);
  });

  it('rejects a missing title, empty content, and an invalid source type', async () => {
    const { app } = createTestApp();
    const missingTitle = await request(app).post('/ingest').send({ sourceType: 'note', content: 'Hello there.' });
    const emptyContent = await request(app).post('/ingest').send({ sourceType: 'note', title: 'Title', content: '   ' });
    const badType = await request(app).post('/ingest').send({ sourceType: 'file', title: 'Title', content: 'Hello' });

    expect(missingTitle.status).toBe(400);
    expect(missingTitle.body.error.code).toBe('VALIDATION_ERROR');
    expect(emptyContent.status).toBe(400);
    expect(emptyContent.body.error.message).toMatch(/content/i);
    expect(badType.status).toBe(400);
    expect(badType.body.error.message).toMatch(/note or url/);
    const listed = await request(app).get('/items');
    expect(listed.body.data.items).toEqual([]);
  });

  it('rejects oversized notes and malformed JSON', async () => {
    const { app } = createTestApp();
    const oversized = await request(app)
      .post('/ingest')
      .send({ sourceType: 'note', title: 'Big', content: 'a'.repeat(100_001) });
    expect(oversized.status).toBe(413);
    expect(oversized.body.error.code).toBe('PAYLOAD_TOO_LARGE');

    const malformed = await request(app)
      .post('/ingest')
      .set('Content-Type', 'application/json')
      .send('{"sourceType":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('MALFORMED_JSON');
  });

  it('marks the item failed when embedding generation fails and does not index it', async () => {
    const { app, db } = createTestApp({
      embeddings: {
        async embed() {
          throw new AppError(502, 'EMBEDDING_FAILED', 'The embedding service could not index this content.');
        },
      },
    });
    const response = await request(app).post('/ingest').send({
      sourceType: 'note',
      title: 'Broken',
      content: 'This note should not become searchable.',
    });
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('EMBEDDING_FAILED');
    const items = await request(app).get('/items');
    expect(items.body.data.items[0].status).toBe('failed');
    expect(new ChunkRepository(db).countSearchable()).toBe(0);
  });
});

describe('POST /ingest urls', () => {
  it('extracts, chunks, and embeds a public page', async () => {
    const { app, db } = createTestApp({ webpage: sampleWebpage() });
    const response = await request(app).post('/ingest').send({
      sourceType: 'url',
      url: 'https://public.example/hooks',
    });
    expect(response.status).toBe(201);
    expect(response.body.data.item.title).toBe('Hooks Guide');
    expect(response.body.data.item.sourceType).toBe('url');
    expect(response.body.data.item.originalUrl).toBe('https://public.example/hooks');
    expect(response.body.data.item.status).toBe('completed');
    expect(new ChunkRepository(db).countSearchable()).toBeGreaterThan(0);
  });

  it('rejects unsafe URLs without storing them', async () => {
    const requested: string[] = [];
    const { app } = createTestApp({
      webpage: createWebpage(async (pageRequest) => {
        requested.push(pageRequest.url.hostname);
        return { status: 200, headers: { 'content-type': 'text/plain' }, body: Buffer.from('nope') };
      }),
    });

    for (const url of ['http://127.0.0.1/admin', 'http://localhost/secret', 'http://192.168.0.5/', 'notaurl']) {
      const response = await request(app).post('/ingest').send({ sourceType: 'url', url });
      expect(response.status).toBe(400);
    }
    const privateHost = await request(app).post('/ingest').send({ sourceType: 'url', url: 'http://private.example/hidden' });
    expect(privateHost.status).toBe(400);
    expect(privateHost.body.error.code).toBe('UNSAFE_URL');
    expect(requested).toEqual([]);

    const listed = await request(app).get('/items');
    expect(listed.body.data.items).toEqual([]);
  });

  it('stores a failed item when the page cannot be read', async () => {
    const { app } = createTestApp({
      webpage: createWebpage(async (pageRequest) => {
        if (pageRequest.url.hostname === 'redirect.example') {
          return { status: 302, headers: { location: 'http://127.0.0.1/secret' }, body: Buffer.alloc(0) };
        }
        return { status: 200, headers: { 'content-type': 'application/pdf' }, body: Buffer.from('%PDF') };
      }),
    });
    const redirect = await request(app).post('/ingest').send({ sourceType: 'url', url: 'http://redirect.example/go' });
    expect(redirect.status).toBe(400);
    expect(redirect.body.error.code).toBe('UNSAFE_URL');

    const pdf = await request(app).post('/ingest').send({ sourceType: 'url', url: 'https://public.example/file.pdf' });
    expect(pdf.status).toBe(415);
    const listed = await request(app).get('/items');
    expect(listed.body.data.items).toHaveLength(1);
    expect(listed.body.data.items[0].status).toBe('failed');
    expect(listed.body.data.items[0].errorMessage).toMatch(/HTML and plain-text/i);
  });
});

describe('GET /items', () => {
  it('returns newest items first with previews and pagination, not raw embeddings', async () => {
    const { app } = createTestApp();
    await request(app).post('/ingest').send({ sourceType: 'note', title: 'Older', content: 'First saved note about pasta.' });
    await request(app).post('/ingest').send({
      sourceType: 'note',
      title: 'Newer',
      content: 'Second saved note about React Hooks and component state.',
    });
    const response = await request(app).get('/items').query({ limit: 1, offset: 0 });
    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].title).toBe('Newer');
    expect(response.body.data.items[0].preview.length).toBeGreaterThan(0);
    expect(response.body.data.items[0].rawContent).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('embedding');
    expect(response.body.data.pagination).toEqual({ limit: 1, offset: 0, total: 2 });

    const notes = await request(app).get('/items').query({ sourceType: 'note', limit: 10 });
    expect(notes.body.data.pagination.total).toBe(2);
  });
});

describe('POST /query', () => {
  it('answers from an empty knowledge base without calling the model', async () => {
    const chat = createFakeChat(async () => '{"answer":"no","citations":[]}');
    const { app } = createTestApp({ chat });
    const response = await request(app).post('/query').send({ question: 'What is saved?' });
    expect(response.status).toBe(200);
    expect(response.body.data.answer).toBe(INSUFFICIENT_ANSWER);
    expect(response.body.data.sources).toEqual([]);
    expect(chat.calls).toHaveLength(0);
  });

  it('retrieves a relevant chunk and drops citations the model invented', async () => {
    const chat = createFakeChat(async (messages) => {
      const match = /chunkId: ([0-9a-f-]+)/i.exec(messages[1]?.content ?? '');
      return JSON.stringify({
        answer: 'Your notes describe React Hooks as a way for functional components to use state.',
        citations: [{ chunkId: match?.[1] }, { chunkId: 'invented-chunk' }],
      });
    });
    const { app } = createTestApp({ chat });
    await request(app).post('/ingest').send({
      sourceType: 'note',
      title: 'React Hooks',
      content: 'React Hooks allow functional components to use state and other React features.',
    });
    await request(app).post('/ingest').send({
      sourceType: 'note',
      title: 'Dinner',
      content: 'Cook pasta in salted water until it is tender.',
    });

    const response = await request(app).post('/query').send({
      question: 'What do my notes say about React Hooks?',
      topK: 2,
    });
    expect(response.status).toBe(200);
    expect(response.body.data.answer).toMatch(/React Hooks/);
    expect(response.body.data.sources).toHaveLength(1);
    expect(response.body.data.sources[0].title).toBe('React Hooks');
    expect(response.body.data.sources[0].sourceType).toBe('note');
    expect(response.body.data.sources[0].snippet).toMatch(/functional components/);
    expect(response.body.data.sources[0].score).toBeGreaterThan(0.2);
    expect(response.body.data.sources[0].url).toBeNull();
    expect(chat.calls).toHaveLength(1);
    expect(chat.calls[0]?.[1]?.content).not.toContain('Cook pasta');
  });

  it('says the evidence is insufficient when nothing is relevant or citations are unsupported', async () => {
    const chat = createFakeChat(async () => JSON.stringify({
      answer: 'I invented a detailed answer.',
      citations: [{ chunkId: 'not-in-context' }],
    }));
    const { app } = createTestApp({ chat, config: testConfig({ retrievalMinScore: 0.99 }) });
    await request(app).post('/ingest').send({
      sourceType: 'note',
      title: 'Dinner',
      content: 'Cook pasta in salted water until it is tender.',
    });
    const unrelated = await request(app).post('/query').send({ question: 'What do my notes say about React Hooks?' });
    expect(unrelated.status).toBe(200);
    expect(unrelated.body.data.answer).toBe(INSUFFICIENT_ANSWER);
    expect(unrelated.body.data.sources).toEqual([]);
    expect(chat.calls).toHaveLength(0);

    const grounded = createFakeChat(async () => JSON.stringify({
      answer: 'I invented a detailed answer.',
      citations: [{ chunkId: 'not-in-context' }],
    }));
    const second = createTestApp({ chat: grounded, embeddings: createFakeEmbeddings() });
    await request(second.app).post('/ingest').send({
      sourceType: 'note',
      title: 'React Hooks',
      content: 'React Hooks allow functional components to use state and other React features.',
    });
    const rejected = await request(second.app).post('/query').send({ question: 'What do my notes say about React Hooks?' });
    expect(rejected.body.data.answer).toBe(INSUFFICIENT_ANSWER);
    expect(rejected.body.data.sources).toEqual([]);
    expect(grounded.calls).toHaveLength(1);
  });

  it('returns a provider failure without leaking upstream details', async () => {
    const { app } = createTestApp({
      chat: {
        async complete() {
          throw new AppError(502, 'LLM_FAILED', 'The answer service could not complete this question.');
        },
      },
    });
    await request(app).post('/ingest').send({
      sourceType: 'note',
      title: 'React Hooks',
      content: 'React Hooks allow functional components to use state and other React features.',
    });
    const response = await request(app).post('/query').send({ question: 'What do my notes say about React Hooks?' });
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('LLM_FAILED');
    expect(JSON.stringify(response.body)).not.toContain('secret');
    expect(response.body.error.stack).toBeUndefined();
  });

  it('requires a question', async () => {
    const { app } = createTestApp();
    const response = await request(app).post('/query').send({ question: '   ' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('health and persistence', () => {
  it('reports database availability', async () => {
    const { app } = createTestApp();
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ status: 'ok', database: 'ok' });
    const missing = await request(app).get('/missing');
    expect(missing.status).toBe(404);
  });

  it('keeps items and embeddings after the database is reopened', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'knowledge-'));
    tempDirs.push(dir);
    const databasePath = join(dir, 'knowledge.db');
    const first = createTestApp({ databasePath });
    const created = await request(first.app).post('/ingest').send({
      sourceType: 'note',
      title: 'Persisted',
      content: 'React Hooks survive an application restart.',
    });
    expect(created.status).toBe(201);
    first.db.close();

    const second = createTestApp({ databasePath });
    const items = new ItemRepository(second.db).list({ limit: 10, offset: 0 });
    const chunks = new ChunkRepository(second.db).listSearchable();
    expect(items.map((item) => item.title)).toEqual(['Persisted']);
    expect(items[0]?.status).toBe('completed');
    expect(JSON.parse(chunks[0]?.embeddingJson ?? 'null')).toEqual([1, 0, 0]);
    second.db.prepare('DELETE FROM items WHERE id = ?').run(items[0]?.id);
    expect(new ChunkRepository(second.db).countSearchable()).toBe(0);
    second.db.close();
  });
});
