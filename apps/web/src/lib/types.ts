import type { components } from '@nexa/api-client';

/** Names for the API's response shapes (generated from its OpenAPI document). */
type Schemas = components['schemas'];

export type Post = Schemas['Post'];
export type PostComment = Schemas['Comment'];
export type Reactions = Schemas['Reactions'];
export type ReactionType = NonNullable<Reactions['viewer_reaction']>;
export type Attachment = Schemas['Attachment'];
export type UploadedFile = Schemas['File'];
export type AllowedContentType = Schemas['CreateUploadRequest']['content_type'];
export type Member = Schemas['Member'];
export type Department = Schemas['Department'];
export type UserRef = NonNullable<Schemas['UserReference']>;
export type UserProfile = Schemas['UserProfile'];
export type Channel = Schemas['Channel'];
export type ConversationSummary = Schemas['ConversationSummary'];
