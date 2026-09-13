/**
 * Writes the OpenAPI document to a file, so clients can generate their types from the exact
 * contract the API validates against: `pnpm --filter @nexa/api openapi:export <path>`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
// Importing the app registers every module's routes and schemas.
import '../src/app';
import { generateOpenApiDocument } from '../src/shared/http/openapi';

const target = resolve(process.argv[2] ?? '../../packages/api-client/openapi.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(generateOpenApiDocument(), null, 2)}\n`);
console.log(`OpenAPI document written to ${target}`);
