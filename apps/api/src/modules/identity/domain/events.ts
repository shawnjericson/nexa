import type { DomainEvent } from '../../../shared/events/event-bus';

export const USER_REGISTERED = 'identity.user_registered';

export type UserRegisteredEvent = DomainEvent<typeof USER_REGISTERED, { username: string }>;

/** A one-click demo visitor. Consumed by organizations, which seats them in the demo. */
export const GUEST_CREATED = 'identity.guest_created';
export type GuestCreatedEvent = DomainEvent<typeof GUEST_CREATED, Record<string, never>>;
