import { createGlobalStore, useStore } from '@openmrs/esm-framework';
import { enqueueOrderBilling } from './api/billing.resource';

/**
 * Integration with the patient chart's shared order basket.
 *
 * The chart's order basket lives in a global store named 'order-basket'
 * (created by @openmrs/esm-patient-common-lib). It is keyed by name in the
 * global store registry, so we get the SAME instance simply by calling
 * createGlobalStore('order-basket', ...) here — without depending on
 * esm-patient-common-lib (which would risk the singleton/version clashes that
 * broke the KenyaEMR modules).
 *
 * On "Sign and close", the orders app iterates every grouping in the store and
 * calls that grouping's registered postDataPrepFunction to turn each basket
 * item into an /order POST payload. We register one generic prep function that
 * reads the order type / concept / care setting we stash on each item, so our
 * imaging / procedure / medical-supply orders are signed together with the
 * native lab and drug orders.
 */

export type OrderRestType = 'order' | 'procedureorder' | 'medicalsupplyorder';

export interface PathDrcBasketItem {
  // Fields the order basket UI / chart expect on every item.
  action: 'NEW';
  display: string;
  concept: { uuid: string; display: string };
  instructions?: string;
  urgency?: 'ROUTINE' | 'STAT' | 'ON_SCHEDULED_DATE';
  /** ISO date-time; required by the backend when urgency is ON_SCHEDULED_DATE. */
  scheduledDate?: string;
  /** ServiceOrder laterality (procedure / imaging orders only). */
  laterality?: 'LEFT' | 'RIGHT' | 'BILATERAL';
  /** Free-text order reason. */
  orderReasonNonCoded?: string;
  /** Procedure orders: operation category concept UUID. */
  category?: string;
  /** Procedure orders: body site concept UUID. */
  bodySite?: string;
  /** Procedure orders: OrderFrequency UUID. */
  frequency?: string;
  /** Procedure orders: number of repeats. */
  numberOfRepeats?: number;
  // Private fields (prefixed) that drive our postDataPrepFunction.
  __id: string;
  __grouping: string;
  __restType: OrderRestType;
  __orderTypeUuid: string;
  __careSetting: string;
}

interface OrderPost {
  type?: string;
  action?: string;
  patient?: string;
  careSetting?: string;
  orderer?: string;
  encounter?: string;
  concept?: string;
  orderType?: string;
  urgency?: string;
  instructions?: string;
  scheduledDate?: string;
  laterality?: string;
  orderReasonNonCoded?: string;
  category?: string;
  bodySite?: string;
  frequency?: string;
  numberOfRepeats?: number;
}

interface OrderBasketStore {
  items: { [patientUuid: string]: { [grouping: string]: Array<PathDrcBasketItem> } };
  postDataPrepFunctions: {
    [grouping: string]: (
      order: PathDrcBasketItem,
      patientUuid: string,
      encounterUuid: string | null,
      ordererUuid: string,
    ) => OrderPost;
  };
}

const orderBasketStore = createGlobalStore<OrderBasketStore>('order-basket', {
  items: {},
  postDataPrepFunctions: {},
});

export const GROUPING_BY_KIND: Record<'imaging' | 'procedure' | 'medicalSupply', string> = {
  imaging: 'path-drc-imaging',
  procedure: 'path-drc-procedure',
  medicalSupply: 'path-drc-medical-supply',
};

function postDataPrep(
  order: PathDrcBasketItem,
  patientUuid: string,
  encounterUuid: string | null,
  ordererUuid: string,
): OrderPost {
  // "Sign and close" calls this once per order. Auto-bill the ordered concept
  // here so billing happens at signing time, once for all orders, not when the
  // order is added to the basket. Fire-and-forget: never blocks order posting.
  void enqueueOrderBilling(order.concept.uuid, patientUuid, ordererUuid);
  return {
    type: order.__restType,
    action: 'NEW',
    patient: patientUuid,
    concept: order.concept.uuid,
    orderType: order.__orderTypeUuid,
    orderer: ordererUuid,
    careSetting: order.__careSetting,
    urgency: order.urgency ?? 'ROUTINE',
    ...(encounterUuid ? { encounter: encounterUuid } : {}),
    ...(order.instructions ? { instructions: order.instructions } : {}),
    ...(order.urgency === 'ON_SCHEDULED_DATE' && order.scheduledDate ? { scheduledDate: order.scheduledDate } : {}),
    ...(order.laterality ? { laterality: order.laterality } : {}),
    ...(order.orderReasonNonCoded ? { orderReasonNonCoded: order.orderReasonNonCoded } : {}),
    ...(order.category ? { category: order.category } : {}),
    ...(order.bodySite ? { bodySite: order.bodySite } : {}),
    ...(order.frequency ? { frequency: order.frequency } : {}),
    ...(order.numberOfRepeats != null ? { numberOfRepeats: order.numberOfRepeats } : {}),
  };
}

/** Registers our generic prep function for a grouping (idempotent). */
export function registerGrouping(grouping: string): void {
  const state = orderBasketStore.getState();
  if (!state.postDataPrepFunctions[grouping]) {
    orderBasketStore.setState({
      postDataPrepFunctions: { ...state.postDataPrepFunctions, [grouping]: postDataPrep },
    });
  }
}

/** Subscribe to the basket items for a patient + grouping. */
export function useBasketItems(patientUuid: string | undefined, grouping: string): Array<PathDrcBasketItem> {
  const state = useStore(orderBasketStore) as OrderBasketStore;
  if (!patientUuid) return [];
  return state.items?.[patientUuid]?.[grouping] ?? [];
}

export function addBasketItem(patientUuid: string, grouping: string, item: PathDrcBasketItem): void {
  registerGrouping(grouping);
  const state = orderBasketStore.getState();
  const current = state.items?.[patientUuid]?.[grouping] ?? [];
  orderBasketStore.setState({
    items: {
      ...state.items,
      [patientUuid]: { ...state.items?.[patientUuid], [grouping]: [...current, item] },
    },
  });
}

export function removeBasketItem(patientUuid: string, grouping: string, id: string): void {
  const state = orderBasketStore.getState();
  const current = state.items?.[patientUuid]?.[grouping] ?? [];
  orderBasketStore.setState({
    items: {
      ...state.items,
      [patientUuid]: { ...state.items?.[patientUuid], [grouping]: current.filter((i) => i.__id !== id) },
    },
  });
}
