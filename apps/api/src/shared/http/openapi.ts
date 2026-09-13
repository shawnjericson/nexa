import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

/**
 * Every module registers its routes and schemas here next to the route definition,
 * so the OpenAPI document is generated from the same Zod schemas used for validation.
 */
export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

export const ErrorResponse = registry.register(
  'ErrorResponse',
  z.object({
    success: z.literal(false),
    status: z.number().int().openapi({ example: 404 }),
    error: z.string().openapi({ example: 'Post not found' }),
    code: z.string().openapi({ example: 'POST_NOT_FOUND' }),
    details: z.unknown().optional(),
    request_id: z.string().openapi({ example: 'req_0f8fad5b-d9cb-469f-a165-70867728950e' }),
  }),
);

export function successResponse<T extends z.ZodType>(data: T) {
  return z.object({ success: z.literal(true), data });
}

export function paginatedResponse<T extends z.ZodType, P extends z.ZodType>(
  item: T,
  pagination: P,
) {
  return z.object({ success: z.literal(true), data: z.array(item), pagination });
}

export function jsonContent(schema: z.ZodType) {
  return { 'application/json': { schema } };
}

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Invalid input',
  401: 'Missing, invalid or expired credentials',
  403: 'Not allowed',
  404: 'Not found',
  409: 'Conflicts with existing data',
  413: 'Payload too large',
  422: 'Well-formed but rejected, e.g. a file whose content is not its declared type',
  429: 'Too many requests',
  503: 'A dependency is unavailable',
};

export function errorResponses(...statuses: number[]) {
  return Object.fromEntries(
    statuses.map((status) => [
      status,
      { description: ERROR_DESCRIPTIONS[status] ?? 'Error', content: jsonContent(ErrorResponse) },
    ]),
  );
}

export const bearerAuth = [{ bearerAuth: [] }];

export function generateOpenApiDocument() {
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'NEXA API',
      version: '0.1.0',
      description:
        'NEXA Workplace - internal social + communication platform. ' +
        'All /api/v1 endpoints except auth require `Authorization: Bearer <access_token>`.',
    },
    servers: [{ url: '/' }],
  });
}
