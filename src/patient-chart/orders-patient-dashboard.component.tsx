import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  DataTableSkeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableExpandedRow,
  TableExpandHeader,
  TableExpandRow,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Tag,
} from '@carbon/react';
import { Add, DocumentImport, Edit, Renew } from '@carbon/react/icons';
import { formatDate, launchWorkspace2, parseDate, showModal, useConfig } from '@openmrs/esm-framework';
import { type Config } from '../config-schema';
import { usePatientOrdersByType, type OrderSummary } from '../api/orders-list.resource';
import { useConceptSetMembers } from '../api/concepts.resource';
import {
  attachmentBytesUrl,
  isImageAttachment,
  usePatientAttachments,
  type PatientAttachment,
} from '../api/attachments.resource';
import { parseResultComment } from '../results-meta';

export type OrderDashboardKind = 'imaging' | 'procedure';

type TFn = (k: string, d: string) => string;

// Per-kind labels and wiring. Everything else (tables, results, attachments,
// printing) is identical between imaging and procedures because both flows
// share the same fulfiller-comment result mechanism.
const KIND_META: Record<
  OrderDashboardKind,
  {
    configKey: 'imaging' | 'procedure';
    addOrderWorkspace: string;
    ariaLabel: (t: TFn) => string;
    ordersTitle: (t: TFn) => string;
    resultsTitle: (t: TFn) => string;
    noOrdersMessage: (t: TFn) => string;
    printReportKind: (t: TFn) => string;
    printProcedureLabel: (t: TFn) => string;
  }
> = {
  imaging: {
    configKey: 'imaging',
    addOrderWorkspace: 'add-imaging-order',
    ariaLabel: (t) => t('radiologyAndImaging', 'Radiology and Imaging'),
    ordersTitle: (t) => t('radiologyImagingOrders', 'Radiology & Imaging Orders'),
    resultsTitle: (t) => t('imagingResults', 'Imaging Results'),
    noOrdersMessage: (t) => t('noImagingOrdersToDisplay', 'There are no imaging orders to display'),
    printReportKind: (t) => t('imaging', 'imaging'),
    printProcedureLabel: (t) => t('radiologyImaging', 'Radiology / Imaging'),
  },
  procedure: {
    configKey: 'procedure',
    addOrderWorkspace: 'add-procedure-order',
    ariaLabel: (t) => t('procedures', 'Procedures'),
    ordersTitle: (t) => t('proceduresOrders', 'Procedure Orders'),
    resultsTitle: (t) => t('procedureResults', 'Procedure Results'),
    noOrdersMessage: (t) => t('noProcedureOrdersToDisplay', 'There are no procedure orders to display'),
    printReportKind: (t) => t('procedure', 'procedure'),
    printProcedureLabel: (t) => t('procedures', 'Procedures'),
  },
};

function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function launchResultsPrint(o: OrderSummary, t: TFn, kind: OrderDashboardKind) {
  const meta = parseResultComment(o.fulfillerComment);
  const display = o.patient?.display ?? '';
  let patientIdentifier = '';
  let patientName = display;
  const sep = display.indexOf(' - ');
  if (sep > -1) {
    patientIdentifier = display.slice(0, sep).trim();
    patientName = display.slice(sep + 3).trim();
  }
  const dispose = showModal('path-drc-print-report-modal', {
    reportKind: capitalize(KIND_META[kind].printReportKind(t)),
    orderNumber: o.orderNumber,
    patientName,
    patientIdentifier: patientIdentifier || '—',
    age: String(o.patient?.person?.age ?? '—'),
    sex: o.patient?.person?.gender?.toUpperCase() ?? '—',
    orderDate: o.dateActivated ? formatDate(parseDate(o.dateActivated), { mode: 'standard', time: false }) : '—',
    procedureLabel: KIND_META[kind].printProcedureLabel(t),
    procedure: o.concept?.display ?? o.display ?? '—',
    findings: meta.report,
    reviewedBy: meta.validatedBy ?? meta.doneBy ?? '',
    closeModal: () => dispose(),
  });
}

interface OrdersPatientDashboardProps {
  patientUuid: string;
  kind: OrderDashboardKind;
}

const GREEN = '#0f6d3d';

function SectionHeading({ title, onRefresh, action }: { title: string; onRefresh?: () => void; action?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem' }}>
      <h3
        style={{
          margin: 0,
          fontSize: '1.125rem',
          fontWeight: 600,
          color: '#161616',
          paddingBottom: '0.25rem',
          borderBottom: `0.25rem solid ${GREEN}`,
          display: 'inline-block',
        }}>
        {title}
      </h3>
      {action ??
        (onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              background: 'none',
              border: 'none',
              color: '#0f62fe',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}>
            {t('refresh', 'Refresh')}
            <Renew size={16} />
          </button>
        ) : null)}
    </div>
  );
}

function priorityTag(urgency: string) {
  if (urgency === 'STAT') return <Tag type="red">{'Stat'}</Tag>;
  if (urgency === 'ON_SCHEDULED_DATE') return <Tag type="gray">{'Scheduled'}</Tag>;
  return <Tag type="green">{'Routine'}</Tag>;
}

function statusTag(o: OrderSummary, t: (k: string, d: string) => string) {
  const s = o.fulfillerStatus;
  if (s === 'COMPLETED') {
    const pending = parseResultComment(o.fulfillerComment).pendingReview;
    return pending ? (
      <Tag type="magenta">{t('pendingReview', 'Pending review')}</Tag>
    ) : (
      <Tag type="green">{t('completed', 'Completed')}</Tag>
    );
  }
  if (s === 'IN_PROGRESS' || s === 'RECEIVED') return <Tag type="blue">{t('inProgress', 'In progress')}</Tag>;
  if (s === 'DECLINED' || s === 'EXCEPTION') return <Tag type="red">{t('rejected', 'Rejected')}</Tag>;
  return <Tag type="gray">{t('orderNotPicked', 'Order not picked')}</Tag>;
}

const OrdersTab: React.FC<{
  orders: OrderSummary[];
  isLoading: boolean;
  onRefresh: () => void;
  patientUuid: string;
  kind: OrderDashboardKind;
}> = ({ orders, isLoading, onRefresh, patientUuid, kind }) => {
  const { t } = useTranslation();
  const headers = [
    { key: 'orderNumber', header: t('orderNo', 'Order No') },
    { key: 'dateOrdered', header: t('dateOrdered', 'Date Ordered') },
    { key: 'order', header: t('order', 'Order') },
    { key: 'priority', header: t('priority', 'Priority') },
    { key: 'orderBy', header: t('orderBy', 'Order By') },
    { key: 'status', header: t('status', 'status') },
  ];
  const rows = orders.map((o) => ({
    id: o.uuid,
    orderNumber: o.orderNumber,
    dateOrdered: o.dateActivated ? formatDate(parseDate(o.dateActivated), { mode: 'standard', time: true }) : '—',
    order: o.concept?.display ?? o.display ?? '—',
    priority: priorityTag(o.urgency),
    orderBy: o.orderer?.display ?? '—',
    status: statusTag(o, t),
  }));

  const addButton = (
    <Button
      kind="ghost"
      size="sm"
      renderIcon={(props: React.ComponentProps<typeof Add>) => <Add size={16} {...props} />}
      onClick={() => launchWorkspace2(KIND_META[kind].addOrderWorkspace, { patientUuid, kind })}>
      {t('addOrder', 'Add Order')}
    </Button>
  );

  return (
    <div style={{ backgroundColor: '#fff', padding: '1rem' }}>
      <SectionHeading title={KIND_META[kind].ordersTitle(t)} action={addButton} />
      {isLoading ? (
        <DataTableSkeleton headers={headers} showHeader={false} showToolbar={false} />
      ) : rows.length === 0 ? (
        <p style={{ color: '#525252', padding: '1rem 0' }}>{KIND_META[kind].noOrdersMessage(t)}</p>
      ) : (
        <DataTable rows={rows} headers={headers}>
          {({ rows: r, headers: hdrs, getHeaderProps, getTableProps }: any) => (
            <TableContainer>
              <Table {...getTableProps()}>
                <TableHead>
                  <TableRow>
                    {hdrs.map((h: any) => (
                      <TableHeader {...getHeaderProps({ header: h })} key={h.key}>
                        {h.header}
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {r.map((row: any) => (
                    <TableRow key={row.id}>
                      {row.cells.map((c: any) => (
                        <TableCell key={c.id}>{c.value}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      )}
    </div>
  );
};

const ResultsTab: React.FC<{
  orders: OrderSummary[];
  isLoading: boolean;
  onRefresh: () => void;
  patientUuid: string;
  kind: OrderDashboardKind;
}> = ({ orders, isLoading, onRefresh, patientUuid, kind }) => {
  const { t } = useTranslation();
  // Only orders that have results entered (completed, incl. pending review).
  const withResults = useMemo(() => orders.filter((o) => o.fulfillerStatus === 'COMPLETED'), [orders]);
  const { attachments: allAttachments } = usePatientAttachments(patientUuid);

  const headers = [
    { key: 'orderNumber', header: t('orderNo', 'Order No') },
    { key: 'orderDate', header: t('orderDate', 'Order Date') },
    { key: 'orderType', header: t('orderType', 'Order Type') },
    { key: 'performer', header: t('performer', 'Performer') },
  ];
  const rows = withResults.map((o) => {
    const meta = parseResultComment(o.fulfillerComment);
    return {
      id: o.uuid,
      orderNumber: o.orderNumber,
      orderDate: o.dateActivated ? formatDate(parseDate(o.dateActivated), { mode: 'standard', time: false }) : '—',
      orderType: o.concept?.display ?? o.display ?? '—',
      performer: meta.doneBy ?? o.orderer?.display ?? '—',
    };
  });

  return (
    <div style={{ backgroundColor: '#fff', padding: '1rem' }}>
      <SectionHeading title={KIND_META[kind].resultsTitle(t)} onRefresh={onRefresh} />
      {isLoading ? (
        <DataTableSkeleton headers={headers} showHeader={false} showToolbar={false} />
      ) : rows.length === 0 ? (
        <p style={{ color: '#525252', padding: '1rem 0' }}>{t('noResultsToDisplay', 'There are no results to display')}</p>
      ) : (
        <DataTable rows={rows} headers={headers}>
          {({ rows: r, headers: hdrs, getHeaderProps, getRowProps, getTableProps }: any) => (
            <TableContainer>
              <Table {...getTableProps()}>
                <TableHead>
                  <TableRow>
                    <TableExpandHeader />
                    {hdrs.map((h: any) => (
                      <TableHeader {...getHeaderProps({ header: h })} key={h.key}>
                        {h.header}
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {r.map((row: any) => {
                    const order = withResults.find((o) => o.uuid === row.id);
                    const meta = order ? parseResultComment(order.fulfillerComment) : null;
                    return (
                      <React.Fragment key={row.id}>
                        <TableExpandRow {...getRowProps({ row })}>
                          {row.cells.map((c: any) => (
                            <TableCell key={c.id}>{c.value}</TableCell>
                          ))}
                        </TableExpandRow>
                        {row.isExpanded && order && (
                          <TableExpandedRow colSpan={hdrs.length + 1}>
                            <div style={{ padding: '0.5rem 0' }}>
                              <div style={{ fontWeight: 700, background: '#e0e0e0', padding: '0.5rem 0.75rem' }}>
                                {t('findings', 'Findings')}
                              </div>
                              <div style={{ padding: '0.75rem', border: '1px solid #f4f4f4', whiteSpace: 'pre-wrap' }}>
                                {meta?.report || '—'}
                              </div>
                              <div
                                style={{
                                  fontWeight: 700,
                                  background: '#e0e0e0',
                                  padding: '0.5rem 0.75rem',
                                  marginTop: '0.5rem',
                                }}>
                                {t('impressions', 'Impressions')}
                              </div>
                              <div style={{ padding: '0.75rem', border: '1px solid #f4f4f4', minHeight: '2rem' }}>
                                {(() => {
                                  const atts = allAttachments.filter((a) =>
                                    (a.comment ?? '').trim().startsWith(order.orderNumber),
                                  );
                                  return atts.length === 0 ? (
                                    <span style={{ color: '#6f6f6f' }}>{t('noAttachments', 'No attachments')}</span>
                                  ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                      {atts.map((a: PatientAttachment) => {
                                        const href = attachmentBytesUrl(a.uuid);
                                        return (
                                          <a key={a.uuid} href={href} target="_blank" rel="noopener noreferrer">
                                            {isImageAttachment(a) ? (
                                              <img
                                                src={href}
                                                alt={a.comment ?? ''}
                                                style={{
                                                  width: '7rem',
                                                  height: '7rem',
                                                  objectFit: 'cover',
                                                  border: '1px solid #e0e0e0',
                                                  borderRadius: '4px',
                                                }}
                                              />
                                            ) : (
                                              <div
                                                style={{
                                                  width: '7rem',
                                                  height: '7rem',
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  justifyContent: 'center',
                                                  border: '1px solid #e0e0e0',
                                                  borderRadius: '4px',
                                                  background: '#f4f4f4',
                                                  fontSize: '0.7rem',
                                                  color: '#525252',
                                                }}>
                                                {(a.bytesMimeType ?? 'FILE').toUpperCase()}
                                              </div>
                                            )}
                                          </a>
                                        );
                                      })}
                                    </div>
                                  );
                                })()}
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.75rem' }}>
                                <Button kind="tertiary" size="sm" onClick={() => launchResultsPrint(order, t, kind)}>
                                  {t('printResults', 'Print results')}
                                </Button>
                              </div>
                            </div>
                          </TableExpandedRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      )}
    </div>
  );
};

const OrdersPatientDashboard: React.FC<OrdersPatientDashboardProps> = ({ patientUuid, kind }) => {
  const { t } = useTranslation();
  const config = useConfig<Config>();
  const orderTypeUuid = config[KIND_META[kind].configKey]?.orderTypeUuid;
  const conceptSetUuid = config[KIND_META[kind].configKey]?.conceptSetUuid;
  const { orders, isLoading, mutate } = usePatientOrdersByType(patientUuid, orderTypeUuid);
  const { memberUuids } = useConceptSetMembers(conceptSetUuid);
  const memberSet = useMemo(() => new Set(memberUuids), [memberUuids]);

  // Scope to the kind's concept set (imaging and procedure can share an OrderType).
  const scopedOrders = useMemo(() => {
    if (!conceptSetUuid) return orders;
    return orders.filter((o) => !!o.concept?.uuid && memberSet.has(o.concept.uuid));
  }, [orders, conceptSetUuid, memberSet]);

  return (
    <div style={{ padding: '1rem' }}>
      <Tabs>
        <TabList aria-label={KIND_META[kind].ariaLabel(t)} contained>
          <Tab renderIcon={(props: React.ComponentProps<typeof Edit>) => <Edit size={16} {...props} />}>
            {t('orders', 'Orders')}
          </Tab>
          <Tab renderIcon={(props: React.ComponentProps<typeof DocumentImport>) => <DocumentImport size={16} {...props} />}>
            {t('results', 'Results')}
          </Tab>
        </TabList>
        <TabPanels>
          <TabPanel style={{ padding: 0 }}>
            <OrdersTab
              orders={scopedOrders}
              isLoading={isLoading}
              onRefresh={() => mutate()}
              patientUuid={patientUuid}
              kind={kind}
            />
          </TabPanel>
          <TabPanel style={{ padding: 0 }}>
            <ResultsTab
              orders={scopedOrders}
              isLoading={isLoading}
              onRefresh={() => mutate()}
              patientUuid={patientUuid}
              kind={kind}
            />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  );
};

export default OrdersPatientDashboard;
