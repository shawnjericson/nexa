import type { RequestHandler } from 'express';
import { Errors } from '../errors/app-error';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(Errors.notFound(`Route ${req.method} ${req.path} not found`, 'ROUTE_NOT_FOUND'));
};
