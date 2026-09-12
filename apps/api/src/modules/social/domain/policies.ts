import { hasPermission, type OrganizationContext } from '../../organization';
import type { Comment, Post, PostType } from './content';

/** The caller of a Social use case: an authenticated user acting inside one organization. */
export interface Actor {
  userId: string;
  organization: OrganizationContext;
}

// Risk register 5.5: the owner may mutate, a moderator (post.moderate) may remove content,
// any other member gets 403. Non-members never get here: their queries are tenant-scoped.

/** Only the author edits a post: moderators may remove content but never rewrite it. */
export function canEditPost(actor: Actor, post: Pick<Post, 'authorId'>): boolean {
  return post.authorId === actor.userId;
}

export function canDeletePost(actor: Actor, post: Pick<Post, 'authorId'>): boolean {
  return post.authorId === actor.userId || hasPermission(actor.organization, 'post.moderate');
}

export function canDeleteComment(actor: Actor, comment: Pick<Comment, 'authorId'>): boolean {
  return comment.authorId === actor.userId || hasPermission(actor.organization, 'post.moderate');
}

export function canPublish(actor: Actor, type: PostType): boolean {
  return type !== 'ANNOUNCEMENT' || hasPermission(actor.organization, 'announcement.publish');
}
