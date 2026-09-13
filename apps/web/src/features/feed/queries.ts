import { unwrap, unwrapBody } from '@nexa/api-client';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { useOrgKey } from '@/features/organization/organization-provider';
import { api } from '@/lib/api/client';
import type { Post, PostComment, ReactionType, Reactions } from '@/lib/types';

interface CursorPage<T> {
  data: T[];
  pagination: { next_cursor: string | null; has_next: boolean; limit: number };
}

const FEED_PAGE_SIZE = 20;
const COMMENT_PAGE_SIZE = 50;

/** The organization's feed, newest first, loaded page by page (cursor pagination). */
export function useFeed() {
  const orgKey = useOrgKey();
  return useInfiniteQuery({
    queryKey: orgKey('feed'),
    queryFn: ({ pageParam }): Promise<CursorPage<Post>> =>
      unwrapBody(
        api.GET('/api/v1/feed', {
          params: { query: { limit: FEED_PAGE_SIZE, ...(pageParam && { cursor: pageParam }) } },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.pagination.next_cursor,
  });
}

export function usePost(id: string) {
  const orgKey = useOrgKey();
  return useQuery({
    queryKey: orgKey('post', id),
    queryFn: () => unwrap(api.GET('/api/v1/posts/{id}', { params: { path: { id } } })),
  });
}

/**
 * Updates a post wherever it is cached - feed pages and the post's own page - so every view
 * shows the same state. Returning null removes it from the feed.
 */
export function usePostCache() {
  const queryClient = useQueryClient();
  const orgKey = useOrgKey();
  return useCallback(
    (id: string, update: (post: Post) => Post | null) => {
      queryClient.setQueryData<InfiniteData<CursorPage<Post>>>(orgKey('feed'), (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                data: page.data.flatMap((post) => (post.id === id ? (update(post) ?? []) : [post])),
              })),
            }
          : data,
      );
      queryClient.setQueryData<Post>(orgKey('post', id), (post) =>
        post ? (update(post) ?? post) : post,
      );
    },
    [queryClient, orgKey],
  );
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  const orgKey = useOrgKey();
  return useMutation({
    mutationFn: (body: {
      content: string;
      type: 'GENERAL' | 'ANNOUNCEMENT';
      attachment_ids: string[];
    }) => unwrap(api.POST('/api/v1/posts', { body })),
    // The write response is the canonical post: show it at once (risk register 15.4).
    onSuccess: (post) => {
      queryClient.setQueryData<InfiniteData<CursorPage<Post>>>(orgKey('feed'), (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page, index) =>
                index === 0
                  ? { ...page, data: [post, ...page.data.filter((item) => item.id !== post.id)] }
                  : page,
              ),
            }
          : data,
      );
    },
  });
}

export function useUpdatePost(id: string) {
  const updatePost = usePostCache();
  return useMutation({
    mutationFn: (content: string) =>
      unwrap(api.PUT('/api/v1/posts/{id}', { params: { path: { id } }, body: { content } })),
    onSuccess: (post) => updatePost(id, () => post),
  });
}

export function useDeletePost(id: string) {
  const updatePost = usePostCache();
  const queryClient = useQueryClient();
  const orgKey = useOrgKey();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE('/api/v1/posts/{id}', { params: { path: { id } } })),
    onSuccess: () => {
      updatePost(id, () => null);
      queryClient.removeQueries({ queryKey: orgKey('post', id) });
    },
  });
}

/** Local result of changing the viewer's reaction, for an immediate UI response. */
export function applyReaction(summary: Reactions, type: ReactionType | null): Reactions {
  const counts = { ...summary.counts };
  let total = summary.total;
  if (summary.viewer_reaction) {
    counts[summary.viewer_reaction] = Math.max(0, counts[summary.viewer_reaction] - 1);
    total -= 1;
  }
  if (type) {
    counts[type] += 1;
    total += 1;
  }
  return { counts, total: Math.max(0, total), viewer_reaction: type };
}

/** Optimistic reaction with rollback (spec §12); changes to one post run one after another. */
export function useReaction(postId: string) {
  const updatePost = usePostCache();
  return useMutation({
    scope: { id: `reaction:${postId}` },
    mutationFn: (type: ReactionType | null) => {
      const path = { params: { path: { id: postId } } };
      return type
        ? unwrap(api.POST('/api/v1/posts/{id}/reactions', { ...path, body: { type } }))
        : unwrap(api.DELETE('/api/v1/posts/{id}/reactions', path));
    },
    onMutate: (type) => {
      let previous: Reactions | undefined;
      updatePost(postId, (post) => {
        previous = post.reactions;
        return { ...post, reactions: applyReaction(post.reactions, type) };
      });
      return { previous };
    },
    onError: (_error, _type, context) => {
      if (context?.previous) {
        const reactions = context.previous;
        updatePost(postId, (post) => ({ ...post, reactions }));
      }
    },
    onSuccess: (reactions) => updatePost(postId, (post) => ({ ...post, reactions })),
  });
}

export function useComments(postId: string) {
  const orgKey = useOrgKey();
  return useInfiniteQuery({
    queryKey: orgKey('comments', postId),
    queryFn: ({ pageParam }): Promise<CursorPage<PostComment>> =>
      unwrapBody(
        api.GET('/api/v1/posts/{id}/comments', {
          params: {
            path: { id: postId },
            query: { limit: COMMENT_PAGE_SIZE, ...(pageParam && { cursor: pageParam }) },
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.pagination.next_cursor,
  });
}

export function useCreateComment(postId: string) {
  const queryClient = useQueryClient();
  const orgKey = useOrgKey();
  const updatePost = usePostCache();
  return useMutation({
    mutationFn: (body: { content: string; parent_id?: string }) =>
      unwrap(api.POST('/api/v1/posts/{id}/comments', { params: { path: { id: postId } }, body })),
    onSuccess: (comment) => {
      queryClient.setQueryData<InfiniteData<CursorPage<PostComment>>>(
        orgKey('comments', postId),
        (data) =>
          data
            ? {
                ...data,
                pages: data.pages.map((page, index) =>
                  index === data.pages.length - 1
                    ? { ...page, data: [...page.data, comment] }
                    : page,
                ),
              }
            : data,
      );
      updatePost(postId, (post) => ({ ...post, comment_count: post.comment_count + 1 }));
    },
  });
}

/** Deleting a comment removes its replies too (the API deletes the whole thread). */
export function useDeleteComment(postId: string) {
  const queryClient = useQueryClient();
  const orgKey = useOrgKey();
  const updatePost = usePostCache();
  return useMutation({
    mutationFn: (commentId: string) =>
      unwrap(api.DELETE('/api/v1/comments/{id}', { params: { path: { id: commentId } } })),
    onSuccess: (_result, commentId) => {
      let removed = 0;
      queryClient.setQueryData<InfiniteData<CursorPage<PostComment>>>(
        orgKey('comments', postId),
        (data) =>
          data
            ? {
                ...data,
                pages: data.pages.map((page) => {
                  const kept = page.data.filter(
                    (comment) => comment.id !== commentId && comment.parent_id !== commentId,
                  );
                  removed += page.data.length - kept.length;
                  return { ...page, data: kept };
                }),
              }
            : data,
      );
      updatePost(postId, (post) => ({
        ...post,
        comment_count: Math.max(0, post.comment_count - Math.max(removed, 1)),
      }));
    },
  });
}
