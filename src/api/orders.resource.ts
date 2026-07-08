import useSWRImmutable from 'swr/immutable';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';

interface VisitResponse {
  results: Array<{
    uuid: string;
    encounters: Array<{ uuid: string; encounterType: { uuid: string } }>;
    location?: { uuid: string };
  }>;
}

interface SessionResponse {
  data: {
    currentProvider?: { uuid: string };
    sessionLocation?: { uuid: string };
  };
}

interface CareSettingResponse {
  data: {
    results: Array<{ uuid: string; name: string; careSettingType: string }>;
  };
}

/** Returns the active visit (if any) for a patient and its first encounter UUID. */
export function useActiveVisit(patientUuid: string | undefined) {
  const url = patientUuid
    ? `${restBaseUrl}/visit?patient=${patientUuid}&includeInactive=false&v=custom:(uuid,encounters:(uuid,encounterType:(uuid)),location:(uuid))`
    : null;
  const { data, isLoading, error } = useSWRImmutable<{ data: VisitResponse }>(url, openmrsFetch);
  const visit = data?.data?.results?.[0];
  return { visit, isLoading, error };
}

/** Returns the current provider UUID from the active session. */
export function useCurrentProvider() {
  const { data, isLoading } = useSWRImmutable<SessionResponse>(`${restBaseUrl}/session`, openmrsFetch);
  return { providerUuid: data?.data?.currentProvider?.uuid, isLoading };
}

/** Returns the Outpatient care setting UUID (falls back to the first available). */
export function useOutpatientCareSetting() {
  const { data, isLoading } = useSWRImmutable<CareSettingResponse>(
    `${restBaseUrl}/caresetting?v=custom:(uuid,name,careSettingType)`,
    openmrsFetch,
  );
  const settings = data?.data?.results ?? [];
  const outpatient = settings.find((s) => s.careSettingType === 'OUTPATIENT') ?? settings[0];
  return { careSettingUuid: outpatient?.uuid, isLoading };
}

export type OrderRestType = 'order' | 'procedureorder' | 'medicalsupplyorder';

export interface CreateOrderPayload {
  type: OrderRestType;
  action: 'NEW';
  patient: string;
  encounter: string;
  concept: string;
  orderType: string;
  orderer: string;
  careSetting: string;
  urgency?: 'ROUTINE' | 'STAT' | 'ON_SCHEDULED_DATE';
  instructions?: string;
  commentToFulfiller?: string;
}

export async function createOrder(payload: CreateOrderPayload) {
  return openmrsFetch(`${restBaseUrl}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });
}
