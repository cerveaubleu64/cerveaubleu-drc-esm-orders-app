import useSWR from 'swr';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';

export interface OrderSummary {
  uuid: string;
  orderNumber: string;
  dateActivated: string;
  action: string;
  urgency: string;
  display: string;
  fulfillerStatus: string | null;
  fulfillerComment: string | null;
  patient:
    | {
        uuid: string;
        display: string;
        person?: { age: number | null; gender: string | null };
      }
    | null;
  concept: { uuid: string; display: string } | null;
  orderer: { uuid: string; display: string } | null;
  instructions: string | null;
  orderReasonNonCoded?: string | null;
}

interface OrdersResponse {
  results: OrderSummary[];
}

/**
 * Update the fulfillerStatus / fulfillerComment of an order. Used to Pick (RECEIVED)
 * or Reject (DECLINED) an order from the dashboard worklist.
 */
export async function updateOrderFulfillerStatus(
  orderUuid: string,
  fulfillerStatus: 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'DECLINED' | 'EXCEPTION',
  fulfillerComment?: string,
) {
  return openmrsFetch(`${restBaseUrl}/order/${orderUuid}/fulfillerdetails`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { fulfillerStatus, fulfillerComment },
  });
}

/**
 * Fetch orders of the given orderType. Uses the OpenMRS REST `/order` endpoint.
 * We pull all orders for the type and filter client-side by `fulfillerStatus` so
 * we can show different tabs (worklist / completed / not done) without re-fetching.
 */
export function useOrdersByType(orderTypeUuid: string | undefined) {
  const url = orderTypeUuid
    ? `${restBaseUrl}/order?orderTypes=${orderTypeUuid}&v=custom:(uuid,orderNumber,dateActivated,action,urgency,display,fulfillerStatus,fulfillerComment,patient:(uuid,display,person:(age,gender)),concept:(uuid,display),orderer:(uuid,display),instructions)`
    : null;
  const { data, error, isLoading, mutate } = useSWR<{ data: OrdersResponse }>(url, openmrsFetch, {
    refreshInterval: 60_000,
  });
  return {
    orders: data?.data?.results ?? [],
    isLoading,
    error,
    mutate,
  };
}

const PATIENT_ORDER_REP =
  'custom:(uuid,orderNumber,dateActivated,action,urgency,display,fulfillerStatus,fulfillerComment,patient:(uuid,display,person:(age,gender)),concept:(uuid,display),orderer:(uuid,display),instructions,orderReasonNonCoded)';

/** Fetch a single patient's orders of the given orderType (for the patient-chart dashboard). */
export function usePatientOrdersByType(patientUuid: string | undefined, orderTypeUuid: string | undefined) {
  const url =
    patientUuid && orderTypeUuid
      ? `${restBaseUrl}/order?patient=${patientUuid}&orderTypes=${orderTypeUuid}&v=${PATIENT_ORDER_REP}`
      : null;
  const { data, error, isLoading, mutate } = useSWR<{ data: OrdersResponse }>(url, openmrsFetch);
  return { orders: data?.data?.results ?? [], isLoading, error, mutate };
}
