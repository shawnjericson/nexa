import type { DomainEvent } from '../../../shared/events/event-bus';

export const USER_REGISTERED = 'identity.user_registered';

export type UserRegisteredEvent = DomainEvent<typeof USER_REGISTERED, { username: string }>;
