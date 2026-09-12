import type { Response } from 'express';

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

export function created<T>(res: Response, data: T): void {
  ok(res, data, 201);
}

/** List response: `{ success, data: [...], pagination: {...} }` (spec section 8.4). */
export function paginated<T, P>(res: Response, data: T[], pagination: P): void {
  res.status(200).json({ success: true, data, pagination });
}

export function noContent(res: Response): void {
  res.status(204).end();
}
