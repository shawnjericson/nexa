import {
  bearerAuth,
  errorResponses,
  jsonContent,
  registry,
  successResponse,
} from '../../../shared/http/openapi';
import {
  ChangePasswordBody,
  LoginBody,
  LoginResult,
  Me,
  RefreshBody,
  RegisterBody,
  UpdateMeBody,
  UserIdParams,
  UserProfile,
  AuthTokens,
} from './schemas';

const EXAM_NOTE = 'Also served under `/api` without the `/v1` segment (exam contract, ADR-010).';

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/register',
  tags: ['Auth'],
  summary: 'Register a new account',
  description: `The new user joins the default organization; its first member becomes OWNER. ${EXAM_NOTE}`,
  request: { body: { content: jsonContent(RegisterBody) } },
  responses: {
    201: { description: 'Account created', content: jsonContent(successResponse(Me)) },
    ...errorResponses(400, 409, 429),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/login',
  tags: ['Auth'],
  summary: 'Log in with email and password',
  description: EXAM_NOTE,
  request: { body: { content: jsonContent(LoginBody) } },
  responses: {
    200: { description: 'Tokens and profile', content: jsonContent(successResponse(LoginResult)) },
    ...errorResponses(400, 401, 403, 429),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/refresh',
  tags: ['Auth'],
  summary: 'Exchange a refresh token for a new token pair',
  description:
    'The refresh token is rotated: the old one stops working. Replaying an already-used token ' +
    'revokes the whole session.',
  request: { body: { content: jsonContent(RefreshBody) } },
  responses: {
    200: { description: 'New token pair', content: jsonContent(successResponse(AuthTokens)) },
    ...errorResponses(400, 401, 429),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/logout',
  tags: ['Auth'],
  summary: 'End the session a refresh token belongs to',
  request: { body: { content: jsonContent(RefreshBody) } },
  responses: { 204: { description: 'Logged out (idempotent)' }, ...errorResponses(400) },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/change-password',
  tags: ['Auth'],
  summary: 'Change password and sign out all other sessions',
  security: bearerAuth,
  request: { body: { content: jsonContent(ChangePasswordBody) } },
  responses: { 204: { description: 'Password changed' }, ...errorResponses(400, 401, 429) },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/users/me',
  tags: ['Users'],
  summary: 'Current user profile',
  description: EXAM_NOTE,
  security: bearerAuth,
  responses: {
    200: { description: 'Profile', content: jsonContent(successResponse(Me)) },
    ...errorResponses(401),
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/users/me',
  tags: ['Users'],
  summary: 'Update username, display name, avatar or bio',
  description: EXAM_NOTE,
  security: bearerAuth,
  request: { body: { content: jsonContent(UpdateMeBody) } },
  responses: {
    200: { description: 'Updated profile', content: jsonContent(successResponse(Me)) },
    ...errorResponses(400, 401, 409),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/users/{id}',
  tags: ['Users'],
  summary: 'Profile of a user who shares an organization with you',
  description: `Users outside your organizations are reported as 404. ${EXAM_NOTE}`,
  security: bearerAuth,
  request: { params: UserIdParams },
  responses: {
    200: { description: 'Profile', content: jsonContent(successResponse(UserProfile)) },
    ...errorResponses(400, 401, 404),
  },
});
