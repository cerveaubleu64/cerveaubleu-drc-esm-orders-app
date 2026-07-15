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
  /** Procedure orders: reference number. */
  accessionNumber?: string | null;
  /** Procedure orders: procedure type (Mineure / Majeure). */
  orderReason?: { uuid: string; display: string } | null;
  /** Procedure orders: body site (stored as the TestOrder specimen source). */
  specimenSource?: { uuid: string; display: string } | null;
  frequency?: { uuid: string; display: string } | null;
  numberOfRepeats?: number | null;
  /** Procedure orders: free-text comments for the fulfiller. */
  commentToFulfiller?: string | null;
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

const BASE_ORDER_PROPS =
  'uuid,orderNumber,dateActivated,action,urgency,display,fulfillerStatus,fulfillerComment,patient:(uuid,display,person:(age,gender)),concept:(uuid,display),orderer:(uuid,display),instructions,orderReasonNonCoded,accessionNumber,orderReason:(uuid,display),commentToFulfiller';

// specimenSource / frequency / numberOfRepeats only exist on TestOrder
// (imaging, procedure); requesting them on a plain Order (medical supply)
// makes the whole REST conversion fail.
const TEST_ORDER_PROPS = ',specimenSource:(uuid,display),frequency:(uuid,display),numberOfRepeats';

function orderRep(includeTestOrderFields: boolean): string {
  return `custom:(${BASE_ORDER_PROPS}${includeTestOrderFields ? TEST_ORDER_PROPS : ''})`;
}

/**
 * Fetch orders of the given orderType. Uses the OpenMRS REST `/order` endpoint.
 * We pull all orders for the type and filter client-side by `fulfillerStatus` so
 * we can show different tabs (worklist / completed / not done) without re-fetching.
 */
export function useOrdersByType(orderTypeUuid: string | undefined, includeTestOrderFields = false) {
  const url = orderTypeUuid
    ? `${restBaseUrl}/order?orderTypes=${orderTypeUuid}&v=${orderRep(includeTestOrderFields)}`
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

/** Fetch a single patient's orders of the given orderType (for the patient-chart dashboard). */
export function usePatientOrdersByType(
  patientUuid: string | undefined,
  orderTypeUuid: string | undefined,
  includeTestOrderFields = true,
) {
  const url =
    patientUuid && orderTypeUuid
      ? `${restBaseUrl}/order?patient=${patientUuid}&orderTypes=${orderTypeUuid}&v=${orderRep(includeTestOrderFields)}`
      : null;
  const { data, error, isLoading, mutate } = useSWR<{ data: OrdersResponse }>(url, openmrsFetch);
  return { orders: data?.data?.results ?? [], isLoading, error, mutate };
}
