import { z } from 'zod';
import '../../../shared/http/openapi';

const Email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Invalid email address').max(254))
  .openapi({ example: 'an.nguyen@nexa.io' });

// bcrypt only uses the first 72 bytes, so longer passwords would be silently truncated.
const NewPassword = z
  .string()
  .min(6, 'Password must be at least 6 characters')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 bytes')
  .openapi({ example: 'secret123' });

const Username = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    'Username may only contain letters, numbers, dots, underscores and hyphens',
  )
  .openapi({ example: 'an.nguyen' });

const DisplayName = z.string().trim().min(1).max(100).openapi({ example: 'An Nguyễn' });

const AvatarUrl = z
  .url({ protocol: /^https?$/, error: 'Must be an http(s) URL' })
  .max(2048)
  .openapi({ example: 'https://cdn.nexa.io/avatars/an.png' });

// ─── Requests ──────────────────────────────────────────────────────────────

export const RegisterBody = z
  .object({
    username: Username,
    email: Email,
    password: NewPassword,
    display_name: DisplayName.optional(),
  })
  .openapi('RegisterRequest');

export const LoginBody = z
  .object({
    email: Email,
    password: z.string().min(1).max(1024),
  })
  .openapi('LoginRequest');

export const RefreshBody = z
  .object({ refresh_token: z.string().min(1).max(512) })
  .openapi('RefreshTokenRequest');

export const ChangePasswordBody = z
  .object({
    current_password: z.string().min(1).max(1024),
    new_password: NewPassword,
  })
  .refine((body) => body.current_password !== body.new_password, {
    message: 'New password must differ from the current password',
    path: ['new_password'],
  })
  .openapi('ChangePasswordRequest');

export const UpdateMeBody = z
  .object({
    username: Username.optional(),
    display_name: DisplayName.optional(),
    avatar_url: AvatarUrl.nullable().optional(),
    avatar: AvatarUrl.nullable()
      .optional()
      .openapi({ description: 'Alias of avatar_url (exam contract)' }),
    bio: z.string().trim().max(500).nullable().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  })
  .openapi('UpdateMeRequest');

export const UserIdParams = z.object({ id: z.uuid() });

// ─── Responses ─────────────────────────────────────────────────────────────

/** Shared with other modules through the Identity public contract. */
export const UserReference = z
  .object({
    id: z.uuid(),
    username: z.string(),
    display_name: z.string(),
    avatar_url: z.string().nullable(),
    deactivated: z.boolean(),
  })
  .openapi('UserReference');

export const UserProfile = z
  .object({
    id: z.uuid(),
    email: z.string(),
    username: z.string(),
    display_name: z.string(),
    avatar_url: z.string().nullable(),
    bio: z.string().nullable(),
    status: z.enum(['ACTIVE', 'DEACTIVATED']),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .openapi('UserProfile');

export const Me = UserProfile.extend({ last_login_at: z.iso.datetime().nullable() }).openapi('Me');

export const AuthTokens = z
  .object({
    token_type: z.literal('Bearer'),
    access_token: z.string(),
    expires_in: z.number().int().openapi({ description: 'Access token lifetime in seconds' }),
    refresh_token: z.string(),
  })
  .openapi('AuthTokens');

export const LoginResult = AuthTokens.extend({ user: Me }).openapi('LoginResult');

export type RegisterInput = z.infer<typeof RegisterBody>;
export type LoginInput = z.infer<typeof LoginBody>;
export type RefreshInput = z.infer<typeof RefreshBody>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordBody>;
export type UpdateMeInput = z.infer<typeof UpdateMeBody>;
export type UserIdInput = z.infer<typeof UserIdParams>;
