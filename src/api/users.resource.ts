import useSWR from 'swr';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';

export interface UserSummary {
  uuid: string;
  display: string;
  person?: { display: string } | null;
}

/**
 * Free-text search over the system users, used to pick the participants of a
 * procedure. Returns the person name when available (user.display is the
 * username).
 */
export function useUserSearch(query: string) {
  const q = query.trim();
  const url = q
    ? `${restBaseUrl}/user?q=${encodeURIComponent(q)}&v=custom:(uuid,display,person:(display))&limit=10`
    : null;
  const { data, error, isLoading } = useSWR<{ data: { results: UserSummary[] } }>(url, openmrsFetch);
  return { users: data?.data?.results ?? [], isLoading, error };
}

export function userDisplayName(u: UserSummary): string {
  return u.person?.display?.trim() || u.display;
}
