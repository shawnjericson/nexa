import { ApiError, unwrap, type components } from '@nexa/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

export type UpdateMeInput = components['schemas']['UpdateMeRequest'];

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateMeInput) => unwrap(api.PUT('/api/v1/users/me', { body })),
    onSuccess: (me) => {
      queryClient.setQueryData(['me'], me);
      // The name and avatar also appear in cached posts, members and messages.
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'org' });
    },
  });
}

/** Other sessions are signed out by the API; this one stays signed in. */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (body: { current_password: string; new_password: string }) => {
      const { error, response } = await api.POST('/api/v1/auth/change-password', { body });
      // 204 No Content when it worked.
      if (error !== undefined || !response.ok) throw ApiError.fromBody(error, response.status);
    },
  });
}
