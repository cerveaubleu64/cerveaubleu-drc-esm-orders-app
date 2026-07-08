import useSWR from 'swr';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';

export interface OrderableConcept {
  uuid: string;
  display: string;
}

interface ConceptSearchResponse {
  results: Array<{ uuid: string; display: string }>;
}

interface ConceptSetResponse {
  setMembers: Array<{ uuid: string; display: string }>;
}

/**
 * If `conceptSetUuid` is set, returns its setMembers (full list, no query needed).
 * Otherwise falls back to a free-text concept search filtered by the query.
 */
export function useOrderableConcepts(conceptSetUuid: string | undefined, query: string) {
  const useSet = Boolean(conceptSetUuid);
  const url = useSet
    ? `${restBaseUrl}/concept/${conceptSetUuid}?v=custom:(setMembers:(uuid,display))`
    : query?.trim()
    ? `${restBaseUrl}/concept?q=${encodeURIComponent(query.trim())}&v=custom:(uuid,display)&limit=20`
    : null;

  const { data, error, isLoading } = useSWR<{ data: ConceptSetResponse | ConceptSearchResponse }>(
    url,
    openmrsFetch,
  );

  const concepts: OrderableConcept[] = data?.data
    ? useSet
      ? ((data.data as ConceptSetResponse).setMembers ?? [])
      : ((data.data as ConceptSearchResponse).results ?? [])
    : [];

  return { concepts, isLoading, error };
}

/** An order frequency option, as returned by the /orderfrequency endpoint. */
export interface OrderFrequency {
  uuid: string;
  display: string;
}

/** Fetches the configured order frequencies (shared with drug orders). */
export function useOrderFrequencies() {
  const { data, error, isLoading } = useSWR<{ data: { results: Array<OrderFrequency> } }>(
    `${restBaseUrl}/orderfrequency?v=custom:(uuid,display)`,
    openmrsFetch,
  );
  return { frequencies: data?.data?.results ?? [], isLoading, error };
}

/**
 * Returns the UUIDs of a concept set's members. Used to scope a dashboard's
 * orders to its own concept set: imaging and procedure orders share the same
 * OrderType (ProcedureOrder), so the only way to tell them apart is whether
 * the ordered concept belongs to the imaging set or the procedure set.
 */
export function useConceptSetMembers(conceptSetUuid: string | undefined) {
  const url = conceptSetUuid ? `${restBaseUrl}/concept/${conceptSetUuid}?v=custom:(setMembers:(uuid))` : null;
  const { data, isLoading } = useSWR<{ data: { setMembers: Array<{ uuid: string }> } }>(url, openmrsFetch);
  return { memberUuids: (data?.data?.setMembers ?? []).map((m) => m.uuid), isLoading };
}
