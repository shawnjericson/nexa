import { unwrap } from '@nexa/api-client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/** The signed-in person's profile. */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => unwrap(api.GET('/api/v1/users/me')),
    staleTime: 5 * 60_000,
  });
}
