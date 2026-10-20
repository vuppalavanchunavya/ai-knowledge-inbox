import type { Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';

export function createHealthHandler(db: DatabaseSync) {
  return function health(_req: Request, res: Response): void {
    try {
      db.prepare('SELECT 1 AS ok').get();
      res.status(200).json({
        success: true,
        data: { status: 'ok', database: 'ok' },
      });
    } catch {
      res.status(503).json({
        success: false,
        error: { code: 'DATABASE_UNAVAILABLE', message: 'The database is unavailable.' },
      });
    }
  };
}
