import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger, requestStore } from '../utils/logger.js';

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  res.setHeader('X-Request-Id', requestId);
  const started = Date.now();
  requestStore.run({ requestId }, () => {
    logger.info('request.received', { method: req.method, path: req.path });
    res.on('finish', () => {
      logger.info('request.completed', {
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - started,
      });
    });
    next();
  });
}

export function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
}
