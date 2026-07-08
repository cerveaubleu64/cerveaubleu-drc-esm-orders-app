import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';

export interface ActiveQueueEntry {
  uuid: string;
  display: string;
}

/**
 * Returns the patient's most recent active (not ended) queue entry, or null.
 * Used to launch the service-queues transition modal ("Patient en transit"),
 * which needs a queue entry to move the patient to another queue/service.
 */
export async function getActiveQueueEntry(patientUuid: string): Promise<ActiveQueueEntry | null> {
  const url = `${restBaseUrl}/queue-entry?patient=${patientUuid}&isEnded=false&v=custom:(uuid,display,startedAt)`;
  const res = await openmrsFetch<{ results: Array<{ uuid: string; display: string; startedAt: string }> }>(url);
  const results = res?.data?.results ?? [];
  if (results.length === 0) return null;
  const latest = results.reduce<{ uuid: string; display: string; startedAt: string } | null>(
    (acc, cur) => (!acc || new Date(cur.startedAt) > new Date(acc.startedAt) ? cur : acc),
    null,
  );
  return latest ? { uuid: latest.uuid, display: latest.display } : null;
}
