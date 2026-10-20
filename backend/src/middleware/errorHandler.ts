import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, isAppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

interface ParserError {
  type?: string;
  status?: number;
  expose?: boolean;
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    return;
  }

  if (error instanceof ZodError) {
    const tooLarge = error.issues.some((issue) => issue.code === 'too_big');
    if (tooLarge) {
      res.status(413).json({
        success: false,
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request is larger than the allowed size.' },
      });
      return;
    }
    const message = error.issues
      .map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join(' ');
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: message || 'The request is invalid.' },
    });
    return;
  }

  const parserError = error as ParserError;
  if (parserError?.type === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      error: { code: 'MALFORMED_JSON', message: 'The request body is not valid JSON.' },
    });
    return;
  }
  if (parserError?.type === 'entity.too.large') {
    res.status(413).json({
      success: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request is larger than the allowed size.' },
    });
    return;
  }

  if (isAppError(error)) {
    logger.error('request.failed', { code: error.code, status: error.statusCode });
    res.status(error.statusCode).json({
      success: false,
      error: { code: error.code, message: error.message },
    });
    return;
  }

  logger.error('request.failed', {
    code: 'INTERNAL_ERROR',
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'That endpoint does not exist.' },
  });
}
