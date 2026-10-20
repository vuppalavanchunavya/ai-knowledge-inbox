import type { Request, Response } from 'express';
import { z } from 'zod';
import { ItemRepository } from '../repositories/item.repository.js';
import type { DatabaseSync } from 'node:sqlite';

export function createItemsHandler(db: DatabaseSync) {
  const items = new ItemRepository(db);
  const schema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
    sourceType: z.enum(['note', 'url']).optional(),
  });

  return async function listItems(req: Request, res: Response): Promise<void> {
    const query = schema.parse(req.query);
    const data = items.list(query);
    const total = items.count(query.sourceType);
    res.status(200).json({
      success: true,
      data: {
        items: data,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total,
        },
      },
    });
  };
}
