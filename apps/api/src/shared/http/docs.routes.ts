import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { generateOpenApiDocument } from './openapi';

type OpenApiDocument = ReturnType<typeof generateOpenApiDocument>;

/**
 * GET /openapi.json - generated document
 * GET /docs         - Swagger UI
 *
 * The document is built lazily on first request, after every module has registered its routes.
 */
export function docsRouter(): Router {
  const router = Router();
  let document: OpenApiDocument | undefined;

  router.get('/openapi.json', (_req, res) => {
    document ??= generateOpenApiDocument();
    res.json(document);
  });

  router.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      customSiteTitle: 'NEXA API Docs',
      swaggerOptions: { url: '/openapi.json', validatorUrl: null, persistAuthorization: true },
    }),
  );

  return router;
}
