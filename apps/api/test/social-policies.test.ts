import { describe, expect, it } from 'vitest';
import {
  canDeleteComment,
  canDeletePost,
  canEditPost,
  canPublish,
  type Actor,
} from '../src/modules/social/domain/policies';

const actor = (userId: string, permissions: string[] = []): Actor => ({
  userId,
  organization: {
    organizationId: 'org',
    membershipId: 'membership',
    roleKey: 'ANY',
    permissions: new Set(permissions),
  },
});

const alice = actor('alice');
const moderator = actor('mod', ['post.moderate', 'announcement.publish']);
const alicesPost = { authorId: 'alice' };

describe('social policies (risk register 5.5)', () => {
  it('only the author may edit a post - moderators included', () => {
    expect(canEditPost(alice, alicesPost)).toBe(true);
    expect(canEditPost(actor('bob'), alicesPost)).toBe(false);
    expect(canEditPost(moderator, alicesPost)).toBe(false);
  });

  it('the author or a moderator may delete posts and comments', () => {
    expect(canDeletePost(alice, alicesPost)).toBe(true);
    expect(canDeletePost(moderator, alicesPost)).toBe(true);
    expect(canDeletePost(actor('bob'), alicesPost)).toBe(false);

    expect(canDeleteComment(alice, alicesPost)).toBe(true);
    expect(canDeleteComment(moderator, alicesPost)).toBe(true);
    expect(canDeleteComment(actor('bob'), alicesPost)).toBe(false);
  });

  it('announcements require announcement.publish; general posts do not', () => {
    expect(canPublish(alice, 'GENERAL')).toBe(true);
    expect(canPublish(alice, 'ANNOUNCEMENT')).toBe(false);
    expect(canPublish(moderator, 'ANNOUNCEMENT')).toBe(true);
  });
});
