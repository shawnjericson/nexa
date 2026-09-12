export type PostType = 'GENERAL' | 'ANNOUNCEMENT' | 'EVENT' | 'POLL';

export type PostVisibility = 'ORGANIZATION' | 'DEPARTMENT' | 'CHANNEL';

export const REACTION_TYPES = ['LIKE', 'LOVE', 'HAHA', 'CELEBRATE', 'SAD'] as const;

export type ReactionType = (typeof REACTION_TYPES)[number];

export interface Post {
  id: string;
  organizationId: string;
  authorId: string;
  content: string;
  imageUrl: string | null;
  type: PostType;
  visibility: PostVisibility;
  /** Comments that are not deleted. */
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Comment {
  id: string;
  organizationId: string;
  postId: string;
  authorId: string;
  /** Always a top-level comment: replies are one level deep. */
  parentId: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReactionSummary {
  counts: Record<ReactionType, number>;
  total: number;
  /** The reaction of the person looking at the post, if any. */
  viewerReaction: ReactionType | null;
}

export function emptyReactionSummary(): ReactionSummary {
  return {
    counts: { LIKE: 0, LOVE: 0, HAHA: 0, CELEBRATE: 0, SAD: 0 },
    total: 0,
    viewerReaction: null,
  };
}
