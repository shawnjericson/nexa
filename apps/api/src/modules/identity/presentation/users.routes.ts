import { Router, type RequestHandler } from 'express';
import { validate } from '../../../shared/http/validate';
import type { UserService } from '../application/user.service';
import { UpdateMeBody, UserIdParams } from './schemas';
import { createUsersController } from './users.controller';

/** /users routes, all signed in. The handlers are in users.controller.ts. */
export function createUsersRouter(deps: {
  users: UserService;
  requireAuth: RequestHandler;
}): Router {
  const controller = createUsersController(deps);
  const router = Router();
  router.use(deps.requireAuth);
  router.get('/me', controller.getMe);
  router.put('/me', validate({ body: UpdateMeBody }), controller.updateMe);
  router.get('/:id', validate({ params: UserIdParams }), controller.getProfile);
  return router;
}
