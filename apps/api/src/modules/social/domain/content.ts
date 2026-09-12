export type PostType = 'GENERAL' | 'ANNOUNCEMENT' | 'EVENT' | 'POLL';

export type PostVisibility = 'ORGANIZATION' | 'DEPARTMENT' | 'CHANNEL';

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
