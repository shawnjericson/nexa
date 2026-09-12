import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';

/** Event envelope, shared with future SaaS integrations (spec section 21.1). */
export interface DomainEvent<
  TType extends string = string,
  TMetadata extends object = Record<string, unknown>,
> {
  id: string;
  type: TType;
  organization_id: string | null;
  actor_id: string | null;
  subject_id: string | null;
  timestamp: string;
  metadata: TMetadata;
}

export function createEvent<TType extends string, TMetadata extends object>(
  type: TType,
  fields: {
    organization_id?: string | null;
    actor_id?: string | null;
    subject_id?: string | null;
    metadata: TMetadata;
  },
): DomainEvent<TType, TMetadata> {
  return {
    id: `evt_${randomUUID()}`,
    type,
    organization_id: fields.organization_id ?? null,
    actor_id: fields.actor_id ?? null,
    subject_id: fields.subject_id ?? null,
    timestamp: new Date().toISOString(),
    metadata: fields.metadata,
  };
}

export type EventHandler<TEvent extends DomainEvent> = (event: TEvent) => Promise<void>;

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe<TEvent extends DomainEvent>(type: TEvent['type'], handler: EventHandler<TEvent>): void;
}

/**
 * Producers publish after their transaction commits. Handlers run in-process, in order;
 * a failing handler is logged and never fails the producer, because side effects are
 * eventually consistent (risk register 12.1).
 * This is replaced by a transactional outbox + worker when event logging lands (ADR-009).
 */
export class InProcessEventBus implements EventBus {
  private readonly handlers = new Map<string, EventHandler<DomainEvent>[]>();

  constructor(private readonly logger: Logger) {}

  subscribe<TEvent extends DomainEvent>(type: TEvent['type'], handler: EventHandler<TEvent>): void {
    const handlers = this.handlers.get(type) ?? [];
    handlers.push(handler as unknown as EventHandler<DomainEvent>);
    this.handlers.set(type, handlers);
  }

  async publish(event: DomainEvent): Promise<void> {
    for (const handler of this.handlers.get(event.type) ?? []) {
      try {
        await handler(event);
      } catch (err) {
        this.logger.error(
          { err, event_id: event.id, event_type: event.type },
          'Event handler failed',
        );
      }
    }
  }
}
