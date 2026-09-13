import type { z } from 'zod';
import { bearerAuth, errorResponses, jsonContent, registry } from './openapi';

type RouteConfig = Parameters<typeof registry.registerPath>[0];
type RequestConfig = NonNullable<RouteConfig['request']>;

/** Compact registration for authenticated JSON endpoints. */
export function registerRoute(config: {
  method: RouteConfig['method'];
  path: string;
  tag: string;
  summary: string;
  description?: string;
  headers?: RequestConfig['headers'];
  params?: RequestConfig['params'];
  query?: RequestConfig['query'];
  body?: z.ZodType;
  status?: number;
  /** Full response body schema. */
  response: z.ZodType;
  errors: number[];
}): void {
  const { method, path, tag, summary, description, headers, params, query, body } = config;
  registry.registerPath({
    method,
    path,
    summary,
    description,
    tags: [tag],
    security: bearerAuth,
    request: {
      ...(headers && { headers }),
      ...(params && { params }),
      ...(query && { query }),
      ...(body && { body: { content: jsonContent(body) } }),
    },
    responses: {
      [config.status ?? 200]: { description: summary, content: jsonContent(config.response) },
      ...errorResponses(...config.errors),
    },
  });
}
