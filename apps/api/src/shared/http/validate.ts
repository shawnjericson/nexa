import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { Errors, type FieldIssue } from '../errors/app-error';

type Location = 'params' | 'query' | 'body';

export type RequestSchemas = Partial<Record<Location, z.ZodType>>;

export function formatZodIssues(error: z.ZodError, location?: Location): FieldIssue[] {
  return error.issues.map((issue) => ({
    field: [location, ...issue.path.map(String)].filter(Boolean).join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Validates and normalizes request input. On success the parsed values replace
 * req.params / req.query / req.body, so handlers only ever see validated data.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    const issues: FieldIssue[] = [];

    for (const location of ['params', 'query', 'body'] as const) {
      const schema = schemas[location];
      if (!schema) continue;

      const result = schema.safeParse(req[location]);
      if (!result.success) {
        issues.push(...formatZodIssues(result.error, location));
        continue;
      }

      // Express 5 exposes req.query as a getter, so it must be redefined rather than assigned.
      Object.defineProperty(req, location, {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

    next(issues.length > 0 ? Errors.validation(issues) : undefined);
  };
}
