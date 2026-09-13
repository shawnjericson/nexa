import { unwrap } from '@nexa/api-client';
import { useQuery } from '@tanstack/react-query';
import { useOrgKey } from '@/features/organization/organization-provider';
import { api } from '@/lib/api/client';

/** The organization's channels, with whether the caller has joined each. */
export function useChannels(enabled = true) {
  const orgKey = useOrgKey();
  return useQuery({
    queryKey: orgKey('channels'),
    queryFn: () => unwrap(api.GET('/api/v1/channels')),
    enabled,
  });
}
