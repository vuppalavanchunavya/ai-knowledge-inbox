import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AppConfig } from '../config/env.js';
import type { RagService } from '../services/rag.service.js';
import { AppError } from '../utils/errors.js';

export function createQueryHandler(rag: RagService, config: AppConfig) {
  const schema = z.object({
    question: z.string().trim().min(1, 'A question is required.').max(config.maxQuestionChars),
    topK: z.number().int().min(1).max(20).optional(),
  });

  return async function query(req: Request, res: Response): Promise<void> {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
    }
    const body = schema.parse(req.body);
    const result = await rag.answer(body.question, body.topK);
    res.status(200).json({ success: true, data: result });
  };
}
