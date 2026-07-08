import { useMemo } from 'react';
import useSWR from 'swr';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';

export interface ServicePrice {
  uuid: string;
  name?: string;
  price: number;
}

export interface BillableService {
  uuid: string;
  name: string;
  concept?: { uuid: string; display?: string };
  servicePrices: Array<ServicePrice>;
}

/**
 * Loads the billing module's billable services (each links a concept to its
 * cash prices). The billableService endpoint does not support filtering by
 * concept, so we fetch the list once and match client-side.
 */
export function useBillableServices() {
  const url = `${restBaseUrl}/billing/billableService?v=custom:(uuid,name,concept:(uuid,display),servicePrices:(uuid,name,price))`;
  const { data, error, isLoading } = useSWR<{ data: { results: Array<BillableService> } }>(url, openmrsFetch);
  return { services: data?.data?.results ?? [], isLoading, error };
}

/** The first configured cash point, needed to open a bill. */
export function useCashPoint() {
  const { data, isLoading } = useSWR<{ data: { results: Array<{ uuid: string; name: string }> } }>(
    `${restBaseUrl}/billing/cashPoint?v=custom:(uuid,name)`,
    openmrsFetch,
  );
  return { cashPointUuid: data?.data?.results?.[0]?.uuid, isLoading };
}

export interface ConceptPrice {
  service: BillableService;
  servicePrice: ServicePrice;
}

/** The billable service + first priced entry for a concept, or null if unpriced. */
export function findConceptPrice(services: Array<BillableService>, conceptUuid: string | undefined): ConceptPrice | null {
  if (!conceptUuid) return null;
  const service = services.find((s) => s.concept?.uuid === conceptUuid);
  const servicePrice = service?.servicePrices?.find((p) => Number(p.price) > 0);
  return service && servicePrice ? { service, servicePrice } : null;
}

interface BillLineItem {
  uuid?: string;
  item?: string;
  billableService?: string;
  quantity: number;
  price: number;
  priceName: string;
  priceUuid?: string;
  lineItemOrder: number;
  paymentStatus: string;
}

interface PendingBill {
  uuid: string;
  status: string;
  lineItems: Array<{
    uuid: string;
    item?: { uuid: string };
    billableService?: { uuid: string };
    quantity: number;
    price: number;
    priceName: string;
    priceUuid?: string;
    lineItemOrder: number;
    paymentStatus: string;
  }>;
}

async function getPendingBill(patientUuid: string): Promise<PendingBill | undefined> {
  const rep =
    'custom:(uuid,status,lineItems:(uuid,quantity,price,priceName,priceUuid,lineItemOrder,paymentStatus,billableService:(uuid),item:(uuid)))';
  const res = await openmrsFetch<{ results: Array<PendingBill> }>(
    `${restBaseUrl}/billing/bill?patientUuid=${patientUuid}&status=PENDING&v=${rep}`,
  );
  return res.data?.results?.find((b) => b.status === 'PENDING');
}

export type BillOrderResult = 'billed' | 'already-billed' | 'no-cash-point';

/**
 * Adds a PENDING line item for an ordered service to the patient's open bill,
 * creating the bill if none exists. Idempotent: skips if the same billable
 * service is already on the pending bill.
 */
export async function billOrder(params: {
  patientUuid: string;
  cashierUuid: string;
  cashPointUuid?: string;
  service: BillableService;
  servicePrice: ServicePrice;
}): Promise<BillOrderResult> {
  const { patientUuid, cashierUuid, cashPointUuid, service, servicePrice } = params;
  if (!cashPointUuid) return 'no-cash-point';

  const newLine: BillLineItem = {
    billableService: service.uuid,
    quantity: 1,
    price: Number(servicePrice.price),
    priceName: servicePrice.name ?? 'Cash',
    priceUuid: servicePrice.uuid,
    lineItemOrder: 0,
    paymentStatus: 'PENDING',
  };

  const existing = await getPendingBill(patientUuid);
  if (existing) {
    const alreadyBilled = existing.lineItems?.some((li) => li.billableService?.uuid === service.uuid);
    if (alreadyBilled) return 'already-billed';

    const lineItems: Array<BillLineItem> = [
      ...existing.lineItems.map((li) => ({
        uuid: li.uuid,
        item: li.item?.uuid,
        billableService: li.billableService?.uuid,
        quantity: li.quantity,
        price: li.price,
        priceName: li.priceName,
        priceUuid: li.priceUuid,
        lineItemOrder: li.lineItemOrder,
        paymentStatus: li.paymentStatus,
      })),
      { ...newLine, lineItemOrder: existing.lineItems.length },
    ];
    await openmrsFetch(`${restBaseUrl}/billing/bill/${existing.uuid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { lineItems },
    });
    return 'billed';
  }

  await openmrsFetch(`${restBaseUrl}/billing/bill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      cashPoint: cashPointUuid,
      cashier: cashierUuid,
      patient: patientUuid,
      status: 'PENDING',
      lineItems: [newLine],
      payments: [],
    },
  });
  return 'billed';
}

// --- Sign-time billing --------------------------------------------------------
// Billing is triggered from the order basket's postDataPrepFunction, i.e. when
// the user clicks "Sign and close", not when an order is added to the basket.
// These helpers run outside React, so they fetch their own context and are
// serialized to avoid racing on the patient's open bill.

let contextCache: { at: number; value: Promise<{ services: Array<BillableService>; cashPointUuid?: string }> } | null =
  null;

function loadBillingContext(): Promise<{ services: Array<BillableService>; cashPointUuid?: string }> {
  const now = Date.now();
  if (contextCache && now - contextCache.at < 15000) return contextCache.value;
  const value = Promise.all([
    openmrsFetch<{ results: Array<BillableService> }>(
      `${restBaseUrl}/billing/billableService?v=custom:(uuid,name,concept:(uuid,display),servicePrices:(uuid,name,price))`,
    ),
    openmrsFetch<{ results: Array<{ uuid: string }> }>(`${restBaseUrl}/billing/cashPoint?v=custom:(uuid)`),
  ]).then(([servicesRes, cashRes]) => ({
    services: servicesRes.data?.results ?? [],
    cashPointUuid: cashRes.data?.results?.[0]?.uuid,
  }));
  contextCache = { at: now, value };
  return value;
}

let billingChain: Promise<unknown> = Promise.resolve();

/**
 * Queues an auto-bill for one ordered concept, to be run when orders are signed.
 * Calls are serialized so several orders signed together append to the same
 * pending bill instead of racing. Priced concepts only; unpriced ones are a
 * no-op. Never throws — billing must not block order placement.
 */
export function enqueueOrderBilling(conceptUuid: string, patientUuid: string, cashierUuid?: string): Promise<void> {
  const run = async () => {
    try {
      if (!cashierUuid) return;
      const { services, cashPointUuid } = await loadBillingContext();
      const priced = findConceptPrice(services, conceptUuid);
      if (!priced) return;
      await billOrder({ patientUuid, cashierUuid, cashPointUuid, ...priced });
    } catch {
      /* billing failures must not break order signing */
    }
  };
  billingChain = billingChain.then(run, run);
  return billingChain as Promise<void>;
}

export interface ConceptPriceInfo {
  /** A billable service is linked to the concept. */
  hasService: boolean;
  /** The linked service has at least one price greater than zero. */
  hasPrice: boolean;
  service?: BillableService;
  price?: number;
}

/** Resolves whether an ordered concept has a configured billing price. */
export function useConceptPrice(conceptUuid: string | undefined): ConceptPriceInfo & { isLoading: boolean } {
  const { services, isLoading } = useBillableServices();
  return useMemo(() => {
    const service = conceptUuid ? services.find((s) => s.concept?.uuid === conceptUuid) : undefined;
    const priced = (service?.servicePrices ?? []).find((p) => Number(p.price) > 0);
    return {
      hasService: Boolean(service),
      hasPrice: Boolean(priced),
      service,
      price: priced ? Number(priced.price) : undefined,
      isLoading,
    };
  }, [services, conceptUuid, isLoading]);
}
