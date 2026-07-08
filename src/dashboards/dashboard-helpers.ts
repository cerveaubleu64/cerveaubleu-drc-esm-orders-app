import { type OrderSummary } from '../api/orders-list.resource';
import { isPendingReviewComment } from '../results-meta';

export type TabKey =
  | 'active'
  | 'worklist'
  | 'referredOut'
  | 'pendingReview'
  | 'approved'
  | 'notDone'
  | 'completed';

export interface TabConfig {
  key: TabKey;
  labelKey: string;
  labelDefault: string;
  sectionKey: string;
  sectionDefault: string;
  emptyKey: string;
  emptyDefault: string;
}

/**
 * Maps a tab to a predicate against an order's fulfillerStatus / action.
 * Statuses not yet tracked in the backend resolve to an empty list.
 */
export function orderMatchesTab(order: OrderSummary, tab: TabKey): boolean {
  const status = order.fulfillerStatus;
  const isPendingReview = status === 'COMPLETED' && isPendingReviewComment(order.fulfillerComment);
  const isApprovedOrCompleted = status === 'COMPLETED' && !isPendingReview;
  switch (tab) {
    case 'active':
      return status === null;
    case 'worklist':
      return status === 'RECEIVED' || status === 'IN_PROGRESS';
    case 'pendingReview':
      return isPendingReview;
    case 'approved':
    case 'completed':
      // Approved (radiology) and Completed (procedure) both surface fully-
      // finished orders: COMPLETED status with the pending-review marker
      // stripped. The two tabs never appear together in the same dashboard.
      return isApprovedOrCompleted;
    case 'notDone':
      return status === 'DECLINED' || status === 'EXCEPTION';
    case 'referredOut':
      return false; // not tracked in backend yet
  }
}

export function withinDateRange(order: OrderSummary, start: Date, end: Date): boolean {
  if (!order.dateActivated) return false;
  const d = new Date(order.dateActivated).getTime();
  const s = startOfDay(start).getTime();
  const e = endOfDay(end).getTime();
  return d >= s && d <= e;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export const RADIOLOGY_TABS: TabConfig[] = [
  {
    key: 'active',
    labelKey: 'activeOrders',
    labelDefault: 'Active Orders',
    sectionKey: 'imagingOrders',
    sectionDefault: 'Imaging Orders',
    emptyKey: 'noImagingOrdersToDisplay',
    emptyDefault: 'There are no imaging orders to display',
  },
  {
    key: 'worklist',
    labelKey: 'workList',
    labelDefault: 'Work List',
    sectionKey: 'imagingWorklist',
    sectionDefault: 'Imaging Worklist',
    emptyKey: 'noImagingWorklistToDisplay',
    emptyDefault: 'There are no imaging orders in the worklist',
  },
  {
    key: 'referredOut',
    labelKey: 'referredOut',
    labelDefault: 'Referred Out',
    sectionKey: 'referredOutImaging',
    sectionDefault: 'Referred Out',
    emptyKey: 'noReferredOutImaging',
    emptyDefault: 'No imaging orders have been referred out',
  },
  {
    key: 'pendingReview',
    labelKey: 'pendingReview',
    labelDefault: 'Pending Review',
    sectionKey: 'pendingReviewImaging',
    sectionDefault: 'Pending Review',
    emptyKey: 'noPendingReviewImaging',
    emptyDefault: 'No imaging orders pending review',
  },
  {
    key: 'approved',
    labelKey: 'approved',
    labelDefault: 'Approved',
    sectionKey: 'approvedImaging',
    sectionDefault: 'Approved',
    emptyKey: 'noApprovedImaging',
    emptyDefault: 'No approved imaging orders',
  },
  {
    key: 'notDone',
    labelKey: 'notDone',
    labelDefault: 'Not Done',
    sectionKey: 'notDoneImaging',
    sectionDefault: 'Not Done',
    emptyKey: 'noNotDoneImaging',
    emptyDefault: 'No imaging orders marked as not done',
  },
];

export const PROCEDURE_TABS: TabConfig[] = [
  {
    key: 'active',
    labelKey: 'proceduresOrdered',
    labelDefault: 'Procedures Ordered',
    sectionKey: 'orderedProcedures',
    sectionDefault: 'Ordered Procedures',
    emptyKey: 'noProcedureOrdersToDisplay',
    emptyDefault: 'There are no procedure orders to display',
  },
  {
    key: 'worklist',
    labelKey: 'worklist',
    labelDefault: 'Worklist',
    sectionKey: 'procedureWorklist',
    sectionDefault: 'Procedure Worklist',
    emptyKey: 'noProcedureWorklistToDisplay',
    emptyDefault: 'No procedures in the worklist',
  },
  {
    key: 'referredOut',
    labelKey: 'referredOut',
    labelDefault: 'Referred Out',
    sectionKey: 'referredOutProcedures',
    sectionDefault: 'Referred Out',
    emptyKey: 'noReferredOutProcedures',
    emptyDefault: 'No procedures have been referred out',
  },
  {
    key: 'notDone',
    labelKey: 'notDone',
    labelDefault: 'Not Done',
    sectionKey: 'notDoneProcedures',
    sectionDefault: 'Not Done',
    emptyKey: 'noNotDoneProcedures',
    emptyDefault: 'No procedures marked as not done',
  },
  {
    key: 'completed',
    labelKey: 'completed',
    labelDefault: 'Completed',
    sectionKey: 'completedProcedures',
    sectionDefault: 'Completed Procedures',
    emptyKey: 'noCompletedProcedures',
    emptyDefault: 'No completed procedures',
  },
];
