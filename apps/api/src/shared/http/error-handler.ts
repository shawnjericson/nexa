import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, Errors } from '../errors/app-error';
import { formatZodIssues } from './validate';

interface HttpLikeError {
  status?: number;
  statusCode?: number;
  type?: string;
  expose?: boolean;
  message?: string;
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return Errors.validation(formatZodIssues(err));

  if (typeof err === 'object' && err !== null) {
    // Safety net for Prisma errors a repository did not translate into a domain error.
    const { name, code } = err as { name?: string; code?: string };
    if (name === 'PrismaClientKnownRequestError') {
      if (code === 'P2002') return new AppError(409, 'CONFLICT', 'Resource already exists');
      if (code === 'P2025') return new AppError(404, 'NOT_FOUND', 'Resource not found');
    }

    const httpError = err as HttpLikeError;
    if (httpError.type === 'entity.parse.failed') {
      return new AppError(400, 'INVALID_JSON', 'Request body contains invalid JSON');
    }
    if (httpError.type === 'entity.too.large') {
      return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    }
    const status = httpError.status ?? httpError.statusCode;
    if (status && status >= 400 && status < 500 && httpError.expose !== false) {
      return new AppError(status, 'BAD_REQUEST', httpError.message ?? 'Bad request');
    }
  }

  return new AppError(500, 'INTERNAL_ERROR', 'Internal server error');
}

/**
 * Response contract (superset of the exam format and the NEXA v1 contract):
 * { success: false, status, error: "<message>", code, details?, request_id }
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const error = toAppError(err);
  if (error.status >= 500) {
    req.log.error({ err }, 'Unhandled error');
  }

  res.status(error.status).json({
    success: false,
    status: error.status,
    error: error.message,
    code: error.code,
    ...(error.details !== undefined && { details: error.details }),
    request_id: req.id,
  });
};
