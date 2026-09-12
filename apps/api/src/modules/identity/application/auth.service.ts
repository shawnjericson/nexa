import { randomUUID } from 'node:crypto';
import { createEvent, type EventBus } from '../../../shared/events/event-bus';
import type { AuthContext } from '../domain/auth-context';
import { USER_REGISTERED, type UserRegisteredEvent } from '../domain/events';
import { IdentityErrors } from '../domain/identity-errors';
import type {
  AccessTokenService,
  NewRefreshToken,
  PasswordHasher,
  RefreshTokenRepository,
  UserRepository,
} from '../domain/ports';
import type { User } from '../domain/user';
import { generateRefreshToken, hashRefreshToken } from './refresh-token';

export interface AuthSettings {
  refreshTokenTtlDays: number;
  refreshReuseGraceSeconds: number;
}

export interface ClientInfo {
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

export interface AuthServiceDeps {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  passwords: PasswordHasher;
  accessTokens: AccessTokenService;
  events: EventBus;
  settings: AuthSettings;
  now?: () => Date;
}

const DAY_MS = 86_400_000;

export class AuthService {
  private readonly now: () => Date;
  private dummyHash?: Promise<string>;

  constructor(private readonly deps: AuthServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async register(input: {
    email: string;
    username: string;
    password: string;
    displayName?: string;
  }): Promise<User> {
    const passwordHash = await this.deps.passwords.hash(input.password);
    const user = await this.deps.users.create({
      email: input.email,
      username: input.username,
      displayName: input.displayName ?? input.username,
      passwordHash,
    });

    const event: UserRegisteredEvent = createEvent(USER_REGISTERED, {
      actor_id: user.id,
      subject_id: user.id,
      metadata: { username: user.username },
    });
    await this.deps.events.publish(event);
    return user;
  }

  async login(
    input: { email: string; password: string },
    client: ClientInfo,
  ): Promise<{ user: User; tokens: AuthTokens }> {
    const user = await this.deps.users.findByEmail(input.email);
    // Unknown emails are checked against a dummy hash so response time doesn't reveal
    // which emails are registered (risk register 4.2).
    const passwordHash = user?.passwordHash ?? (await this.getDummyHash());
    const passwordMatches = await this.deps.passwords.verify(input.password, passwordHash);
    if (!user || !passwordMatches) throw IdentityErrors.invalidCredentials();
    if (user.status !== 'ACTIVE') throw IdentityErrors.accountDeactivated();

    const tokens = await this.startSession(user.id, client);
    const updated = await this.deps.users.recordLogin(user.id, this.now());
    return { user: updated, tokens };
  }

  async refresh(refreshToken: string, client: ClientInfo): Promise<AuthTokens> {
    const now = this.now();
    const record = await this.deps.refreshTokens.findByHash(hashRefreshToken(refreshToken));
    if (!record) throw IdentityErrors.invalidRefreshToken();

    if (record.revokedAt) {
      const wasRotated = record.replacedById !== null;
      const secondsSinceRevoked = (now.getTime() - record.revokedAt.getTime()) / 1000;
      if (wasRotated && secondsSinceRevoked > this.deps.settings.refreshReuseGraceSeconds) {
        // An already-exchanged token is being replayed: assume it leaked and end the session.
        await this.deps.refreshTokens.revokeFamily(record.familyId, now);
        throw IdentityErrors.refreshTokenReused();
      }
      throw IdentityErrors.invalidRefreshToken();
    }
    if (record.expiresAt.getTime() <= now.getTime()) throw IdentityErrors.invalidRefreshToken();

    const user = await this.deps.users.findById(record.userId);
    if (!user || user.status !== 'ACTIVE') {
      await this.deps.refreshTokens.revokeFamily(record.familyId, now);
      throw IdentityErrors.invalidRefreshToken();
    }

    const next = generateRefreshToken();
    const rotated = await this.deps.refreshTokens.rotate(
      record.id,
      this.newRecord(user.id, record.familyId, next.hash, client, now),
      now,
    );
    if (!rotated) throw IdentityErrors.invalidRefreshToken();

    const access = await this.deps.accessTokens.issue({
      userId: user.id,
      sessionId: record.familyId,
    });
    return { accessToken: access.token, expiresIn: access.expiresIn, refreshToken: next.token };
  }

  /** Ends the session the refresh token belongs to. Unknown tokens are ignored (idempotent). */
  async logout(refreshToken: string): Promise<void> {
    const record = await this.deps.refreshTokens.findByHash(hashRefreshToken(refreshToken));
    if (record) await this.deps.refreshTokens.revokeFamily(record.familyId, this.now());
  }

  /** Changes the password and signs out every other session; the current one stays valid. */
  async changePassword(
    auth: AuthContext,
    input: { currentPassword: string; newPassword: string },
  ): Promise<void> {
    const user = await this.deps.users.findById(auth.userId);
    if (!user) throw IdentityErrors.userNotFound();
    if (!(await this.deps.passwords.verify(input.currentPassword, user.passwordHash))) {
      throw IdentityErrors.invalidCurrentPassword();
    }

    await this.deps.users.updatePasswordHash(
      user.id,
      await this.deps.passwords.hash(input.newPassword),
    );
    await this.deps.refreshTokens.revokeAllForUser(user.id, this.now(), auth.sessionId);
  }

  private async startSession(userId: string, client: ClientInfo): Promise<AuthTokens> {
    const familyId = randomUUID();
    const refresh = generateRefreshToken();
    await this.deps.refreshTokens.create(
      this.newRecord(userId, familyId, refresh.hash, client, this.now()),
    );
    const access = await this.deps.accessTokens.issue({ userId, sessionId: familyId });
    return { accessToken: access.token, expiresIn: access.expiresIn, refreshToken: refresh.token };
  }

  private newRecord(
    userId: string,
    familyId: string,
    tokenHash: string,
    client: ClientInfo,
    now: Date,
  ): NewRefreshToken {
    return {
      userId,
      familyId,
      tokenHash,
      expiresAt: new Date(now.getTime() + this.deps.settings.refreshTokenTtlDays * DAY_MS),
      userAgent: client.userAgent,
      ipAddress: client.ipAddress,
    };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.deps.passwords.hash(randomUUID());
    return this.dummyHash;
  }
}
