import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { AppError } from '../../../shared/errors/app-error';
import { createEvent, type EventBus } from '../../../shared/events/event-bus';
import type { AuthContext } from '../domain/auth-context';
import {
  GUEST_CREATED,
  USER_REGISTERED,
  type GuestCreatedEvent,
  type UserRegisteredEvent,
} from '../domain/events';
import { GUEST_EMAIL_DOMAIN } from '../domain/guest';
import { IdentityErrors } from '../domain/identity-errors';
import type {
  AccessTokenService,
  AccountLinkTokens,
  ExternalIdentityVerifier,
  ExternalProfile,
  NewRefreshToken,
  PasswordHasher,
  RefreshTokenRepository,
  UserRepository,
} from '../domain/ports';
import { NO_PASSWORD, type User } from '../domain/user';
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
  /** Google sign-in; null when it is not configured. */
  externalIdentity?: ExternalIdentityVerifier | null;
  linkTokens: AccountLinkTokens;
  now?: () => Date;
}

const DAY_MS = 86_400_000;
/**
 * How long a revoked refresh token is kept. A rotated token presented again is how a stolen one
 * gets caught (the whole session is revoked), so they are not deleted straight away - but every
 * refresh adds a row, and someone who works in NEXA all day refreshes dozens of times.
 */
const REVOKED_TOKEN_RETENTION_DAYS = 7;
const USERNAME_ATTEMPTS = 6;

/** Usernames to try for an account created from a provider: the email's local part, then variants. */
function usernameCandidates(localPart: string): string[] {
  const base = localPart
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/^[._-]+/, '')
    .slice(0, 24);
  const stem = base.length >= 3 ? base : `${base}user`;
  return [
    stem,
    ...Array.from({ length: USERNAME_ATTEMPTS - 1 }, () => `${stem}${randomInt(1000, 10_000)}`),
  ];
}

/** The stored hash, or null when there is no account or it has no password. */
function passwordOf(user: User | null): string | null {
  return user && user.passwordHash !== NO_PASSWORD ? user.passwordHash : null;
}

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
    await this.publishRegistered(user);
    return user;
  }

  async login(
    input: { email: string; password: string },
    client: ClientInfo,
  ): Promise<{ user: User; tokens: AuthTokens }> {
    const user = await this.deps.users.findByEmail(input.email);
    // Unknown emails, and accounts without a password, are checked against a dummy hash so
    // response time doesn't reveal which emails are registered (risk register 4.2).
    const stored = passwordOf(user);
    const passwordMatches = await this.deps.passwords.verify(
      input.password,
      stored ?? (await this.getDummyHash()),
    );
    if (!user || !stored || !passwordMatches) throw IdentityErrors.invalidCredentials();
    return this.signIn(user, client);
  }

  /**
   * Signs in with a provider's ID token (ADR-020). A connected identity signs straight in and a
   * new email gets an account. An email that already belongs to an account must prove that
   * account's password first (linkExternal): registration doesn't verify emails, so anyone could
   * have registered it in advance to take over the provider sign-in (pre-hijacking).
   */
  async loginWithExternal(
    idToken: string,
    nonce: string,
    client: ClientInfo,
  ): Promise<{ user: User; tokens: AuthTokens; created: boolean }> {
    const verifier = this.deps.externalIdentity;
    if (!verifier) throw IdentityErrors.ssoNotConfigured();
    const profile = await verifier.verify(idToken, nonce);

    const connected = await this.deps.users.findByIdentity(profile.provider, profile.subject);
    if (connected) return { ...(await this.signIn(connected, client)), created: false };

    if (!profile.emailVerified) throw IdentityErrors.externalEmailUnverified();
    if (await this.deps.users.findByEmail(profile.email)) {
      throw IdentityErrors.accountLinkRequired(
        await this.deps.linkTokens.issue(profile),
        profile.email,
      );
    }
    const user = await this.createExternalUser(profile);
    return { ...(await this.signIn(user, client)), created: true };
  }

  /** Connects a verified provider sign-in to the existing account once its password is right. */
  async linkExternal(
    linkToken: string,
    password: string,
    client: ClientInfo,
  ): Promise<{ user: User; tokens: AuthTokens }> {
    const profile = await this.deps.linkTokens.verify(linkToken);
    const user = await this.deps.users.findByEmail(profile.email);
    const stored = passwordOf(user);
    const passwordMatches = await this.deps.passwords.verify(
      password,
      stored ?? (await this.getDummyHash()),
    );
    if (!user || !stored || !passwordMatches) throw IdentityErrors.invalidCredentials();

    await this.deps.users.linkIdentity(user.id, {
      provider: profile.provider,
      subject: profile.subject,
      email: profile.email,
    });
    return this.signIn(user, client);
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

  /** Deletes refresh tokens that have expired, or were revoked more than a week ago. */
  pruneRefreshTokens(): Promise<number> {
    const now = this.now();
    const revokedBefore = new Date(now.getTime() - REVOKED_TOKEN_RETENTION_DAYS * DAY_MS);
    return this.deps.refreshTokens.deleteStale(now, revokedBefore);
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

  private async signIn(
    user: User,
    client: ClientInfo,
  ): Promise<{ user: User; tokens: AuthTokens }> {
    if (user.status !== 'ACTIVE') throw IdentityErrors.accountDeactivated();
    const tokens = await this.startSession(user.id, client);
    const updated = await this.deps.users.recordLogin(user.id, this.now());
    return { user: updated, tokens };
  }

  private async createExternalUser(profile: ExternalProfile): Promise<User> {
    // The account signs in through the provider.
    const passwordHash = NO_PASSWORD;
    const localPart = profile.email.split('@')[0] ?? '';
    for (const username of usernameCandidates(localPart)) {
      try {
        const user = await this.deps.users.createWithIdentity(
          {
            email: profile.email,
            username,
            displayName: profile.name ?? (localPart || username),
            passwordHash,
            avatarUrl: profile.picture,
          },
          { provider: profile.provider, subject: profile.subject, email: profile.email },
        );
        await this.publishRegistered(user);
        return user;
      } catch (err) {
        if (err instanceof AppError && err.code === 'USERNAME_TAKEN') continue;
        throw err;
      }
    }
    throw IdentityErrors.usernameTaken();
  }

  /** New accounts join the default organization through this event (ADR-012). */
  /**
   * "Try the demo": an account nobody holds the password to, seated in the demo organization
   * before this returns - handlers run in order and are awaited - and signed straight in. It does
   * not publish USER_REGISTERED, so a guest never lands in the default organization instead.
   */
  async startDemo(client: ClientInfo): Promise<{ user: User; tokens: AuthTokens }> {
    const id = randomBytes(5).toString('hex');
    const user = await this.deps.users.create({
      email: `guest-${id}@${GUEST_EMAIL_DOMAIN}`,
      username: `khach_${id}`,
      displayName: `Khách ${id.slice(0, 4).toUpperCase()}`,
      passwordHash: NO_PASSWORD,
    });
    const event: GuestCreatedEvent = createEvent(GUEST_CREATED, {
      actor_id: user.id,
      subject_id: user.id,
      metadata: {},
    });
    await this.deps.events.publish(event);
    return this.signIn(user, client);
  }

  private async publishRegistered(user: User): Promise<void> {
    const event: UserRegisteredEvent = createEvent(USER_REGISTERED, {
      actor_id: user.id,
      subject_id: user.id,
      metadata: { username: user.username },
    });
    await this.deps.events.publish(event);
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
