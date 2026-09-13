import createClient, { type Client } from 'openapi-fetch';
import type { paths } from './schema';

export type { components, paths } from './schema';

/**
 * Typed NEXA API client. Paths, parameters and bodies are checked against the OpenAPI document
 * the API validates with, so a contract change fails the web build instead of breaking at runtime.
 * Regenerate with `pnpm api-client:generate`.
 */
export type ApiClient = Client<paths>;

export function createApiClient(options: {
  baseUrl: string;
  fetch?: (request: Request) => Promise<Response>;
}): ApiClient {
  return createClient<paths>({ baseUrl: options.baseUrl, fetch: options.fetch });
}

/** The unified error body of the NEXA API (ADR-010). */
export interface ApiErrorBody {
  success: false;
  status: number;
  error: string;
  code: string;
  details?: unknown;
  request_id?: string;
}

export interface FieldIssue {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level validation issues (VALIDATION_ERROR), e.g. `body.email`. */
  get fieldIssues(): FieldIssue[] {
    return Array.isArray(this.details)
      ? this.details.filter(
          (issue): issue is FieldIssue =>
            typeof issue === 'object' &&
            issue !== null &&
            typeof (issue as FieldIssue).field === 'string',
        )
      : [];
  }

  static fromBody(body: unknown, status: number): ApiError {
    if (isErrorBody(body)) {
      return new ApiError(body.status, body.code, body.error, body.details, body.request_id);
    }
    return new ApiError(status, status >= 500 ? 'SERVER_ERROR' : 'UNKNOWN_ERROR', 'Request failed');
  }
}

function isErrorBody(body: unknown): body is ApiErrorBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as ApiErrorBody).code === 'string' &&
    typeof (body as ApiErrorBody).error === 'string'
  );
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

interface Result {
  data?: unknown;
  error?: unknown;
  response: Response;
}

type Body<R extends Result> = NonNullable<R['data']>;

/** The whole success body, e.g. `{ success, data, pagination }`, or throws ApiError. */
export async function unwrapBody<R extends Result>(request: Promise<R>): Promise<Body<R>> {
  const result = await request;
  if (result.error !== undefined || !result.response.ok) {
    throw ApiError.fromBody(result.error, result.response.status);
  }
  return result.data as Body<R>;
}

/** `data` of a success envelope `{ success: true, data }`, or throws ApiError. */
export async function unwrap<R extends Result>(
  request: Promise<R>,
): Promise<Body<R> extends { data: infer T } ? T : never> {
  const body = (await unwrapBody(request)) as unknown as { data: unknown };
  return body.data as Body<R> extends { data: infer T } ? T : never;
}
