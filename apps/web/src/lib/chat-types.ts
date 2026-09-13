import type { components } from '@nexa/api-client';

type Schemas = components['schemas'];

// The OpenAPI document marks Message nullable because a conversation's last message may be absent.
export type Message = NonNullable<Schemas['Message']>;
export type ConversationSummary = Schemas['ConversationSummary'];
export type ConversationDetails = Schemas['Conversation'];
export type ConversationType = ConversationSummary['type'];
export type AppNotification = Schemas['Notification'];
