import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AppConfig } from '../config/env.js';
import type { IngestionService } from '../services/ingestion.service.js';
import { AppError } from '../utils/errors.js';

export function createIngestHandler(ingestion: IngestionService, config: AppConfig) {
  const schema = z.discriminatedUnion('sourceType', [
    z.object({
      sourceType: z.literal('note'),
      title: z.string().trim().min(1, 'A title is required.').max(config.maxTitleChars),
      content: z.string().trim().min(1, 'Note content is required.').max(config.maxNoteChars),
    }),
    z.object({
      sourceType: z.literal('url'),
      url: z.string().trim().min(1, 'A URL is required.').max(2048),
    }),
  ]);

  return async function ingest(req: Request, res: Response): Promise<void> {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
    }
    const sourceType = (req.body as { sourceType?: unknown }).sourceType;
    if (sourceType !== 'note' && sourceType !== 'url') {
      throw new AppError(400, 'VALIDATION_ERROR', 'sourceType must be note or url.');
    }
    const body = schema.parse(req.body);
    const item =
      body.sourceType === 'note'
        ? await ingestion.ingestNote({ title: body.title, content: body.content })
        : await ingestion.ingestUrl({ url: body.url });
    res.status(201).json({ success: true, data: { item } });
  };
}
