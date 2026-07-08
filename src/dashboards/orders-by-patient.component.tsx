import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  DataTableSkeleton,
  OverflowMenu,
  OverflowMenuItem,
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
  Tag,
} from '@carbon/react';
import {
  ConfigurableLink,
  formatDate,
  launchWorkspace2,
  parseDate,
  showModal,
  showSnackbar,
  useSession,
} from '@openmrs/esm-framework';
import { type OrderSummary, updateOrderFulfillerStatus } from '../api/orders-list.resource';
import {
  attachmentBytesUrl,
  isImageAttachment,
  usePatientAttachments,
  type PatientAttachment,
} from '../api/attachments.resource';
import { buildResultComment, isPendingReviewComment, parseResultComment } from '../results-meta';
import { getActiveQueueEntry } from '../api/queue.resource';
import { type TabKey } from './dashboard-helpers';

interface OrdersByPatientProps {
  orders: OrderSummary[];
  isLoading: boolean;
  error: unknown;
  /** Literal kind for behavior switching ("imaging" enables file upload + pending review). */
  kind: 'imaging' | 'procedure' | 'medicalSupply';
  /** Which tab is rendering this table — the Action menu shows on approved/completed. */
  tabKey: TabKey;
  /** Localized noun for the order kind, e.g. "imaging" or "procedure". */
  kindNoun: string;
  /** Singular noun used in action labels, e.g. "imaging request" / "procedure". */
  requestNoun: string;
  onChanged: () => void;
}

interface PatientGroup {
  patientUuid: string;
  patientName: string;
  age: number | string;
  sex: string;
  orders: OrderSummary[];
}

function isPendingReviewOrder(o: OrderSummary): boolean {
  return o.fulfillerStatus === 'COMPLETED' && isPendingReviewComment(o.fulfillerComment);
}

function statusVisual(o: OrderSummary): { type: 'green' | 'magenta' | 'red' | 'blue' | 'gray'; label: string } {
  if (isPendingReviewOrder(o)) return { type: 'magenta', label: 'Pending review' };
  switch (o.fulfillerStatus) {
    case 'COMPLETED':
      return { type: 'green', label: 'Completed' };
    case 'IN_PROGRESS':
      return { type: 'blue', label: 'In progress' };
    case 'RECEIVED':
      return { type: 'blue', label: 'Picked' };
    case 'DECLINED':
    case 'EXCEPTION':
      return { type: 'red', label: 'Rejected' };
    default:
      return { type: 'magenta', label: 'Order not picked' };
  }
}

function urgencyVisual(urgency: string): { type: 'green' | 'red' | 'gray'; label: string } {
  switch (urgency) {
    case 'STAT':
      return { type: 'red', label: 'Stat' };
    case 'ON_SCHEDULED_DATE':
      return { type: 'gray', label: 'Scheduled' };
    default:
      return { type: 'green', label: 'Routine' };
  }
}

const OrdersByPatient: React.FC<OrdersByPatientProps> = ({
  orders,
  isLoading,
  error,
  kind,
  tabKey,
  kindNoun,
  requestNoun,
  onChanged,
}) => {
  const { t } = useTranslation();
  const session = useSession();
  const currentUserName = session?.user?.person?.display ?? session?.user?.display ?? '';

  const groups: PatientGroup[] = useMemo(() => {
    const byPatient = new Map<string, PatientGroup>();
    for (const o of orders) {
      const uuid = o.patient?.uuid ?? '__unknown__';
      const existing = byPatient.get(uuid);
      if (existing) {
        existing.orders.push(o);
      } else {
        byPatient.set(uuid, {
          patientUuid: uuid,
          patientName: o.patient?.display ?? t('unknownPatient', 'Unknown'),
          age: o.patient?.person?.age ?? '—',
          sex: o.patient?.person?.gender?.toUpperCase() ?? '—',
          orders: [o],
        });
      }
    }
    return Array.from(byPatient.values());
  }, [orders, t]);

  // The Action overflow menu only makes sense once results are finalised.
  const showActionColumn = tabKey === 'approved' || tabKey === 'completed';

  const headers = [
    { key: 'patientName', header: t('patient', 'Patient') },
    { key: 'age', header: t('age', 'Age') },
    { key: 'sex', header: t('sex', 'Sex') },
    { key: 'total', header: t('totalOrders', 'Total orders') },
    ...(showActionColumn ? [{ key: 'action', header: t('action', 'Action') }] : []),
  ];

  const rows = groups.map((g) => ({
    id: g.patientUuid,
    patientName:
      g.patientUuid && g.patientUuid !== '__unknown__' ? (
        <ConfigurableLink
          to={`\${openmrsSpaBase}/patient/${g.patientUuid}/chart/Patient%20Summary`}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          {g.patientName}
        </ConfigurableLink>
      ) : (
        g.patientName
      ),
    age: String(g.age),
    sex: g.sex,
    total: String(g.orders.length),
    ...(showActionColumn
      ? {
          action: (
            <div onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <OverflowMenu aria-label={t('action', 'Action')} flipped size="sm">
                <OverflowMenuItem
                  itemText={t('patientInTransit', 'Patient in transit')}
                  onClick={() => launchTransit(g)}
                />
                {/* Approved/completed exams are final: no "Modify results" here. */}
                <OverflowMenuItem
                  itemText={t('printResults', 'Print results')}
                  onClick={() => g.orders[0] && launchPrintReport(g.orders[0], g)}
                />
              </OverflowMenu>
            </div>
          ),
        }
      : {}),
  }));

  function launchPickConfirm(o: OrderSummary) {
    const dispose = showModal('path-drc-pick-confirm-modal', {
      orderUuid: o.uuid,
      requestNoun,
      onSuccess: onChanged,
      closeModal: () => dispose(),
    });
  }

  async function launchTransit(group: PatientGroup) {
    if (!group.patientUuid || group.patientUuid === '__unknown__') return;
    try {
      const entry = await getActiveQueueEntry(group.patientUuid);
      if (!entry) {
        showSnackbar({
          title: t('noActiveQueueEntry', 'No active queue entry'),
          subtitle: t('patientNotInQueue', 'This patient is not currently in a queue.'),
          kind: 'warning',
          isLowContrast: false,
        });
        return;
      }
      const dispose = showModal('transition-queue-entry-modal', {
        queueEntry: entry,
        closeModal: () => dispose(),
      });
    } catch (err: any) {
      showSnackbar({
        title: t('actionFailed', 'Action failed'),
        subtitle: err?.responseBody?.error?.message || err?.message,
        kind: 'error',
        isLowContrast: false,
      });
    }
  }

  function launchReject(o: OrderSummary) {
    const dispose = showModal('path-drc-reject-with-reason-modal', {
      orderUuid: o.uuid,
      orderNumber: o.orderNumber,
      requestNoun,
      typeLabel: t('xType', '{{noun}} type', { noun: capitalize(kindNoun) }),
      conceptDisplay: o.concept?.display ?? o.display ?? '—',
      onSuccess: onChanged,
      closeModal: () => dispose(),
    });
  }

  function launchEnterResults(o: OrderSummary) {
    const isImaging = kind === 'imaging';
    launchWorkspace2('path-drc-enter-results', {
      orderUuid: o.uuid,
      orderNumber: o.orderNumber,
      patientUuid: o.patient?.uuid ?? '',
      kindNoun,
      conceptDisplay: o.concept?.display ?? o.display ?? '—',
      allowFileUpload: isImaging,
      requiresReview: isImaging,
      initialResult: parseResultComment(o.fulfillerComment).report,
      onSuccess: onChanged,
    });
  }

  function launchPrintReport(o: OrderSummary, group: PatientGroup) {
    const meta = parseResultComment(o.fulfillerComment);
    const display = group.patientName;
    let patientIdentifier = '';
    let patientName = display;
    const sep = display.indexOf(' - ');
    if (sep > -1) {
      patientIdentifier = display.slice(0, sep).trim();
      patientName = display.slice(sep + 3).trim();
    }
    const procedureLabel =
      kind === 'imaging' ? t('radiologyImaging', 'Radiology / Imaging') : t('procedure', 'Procedure');
    const dispose = showModal('path-drc-print-report-modal', {
      reportKind: capitalize(kindNoun),
      orderNumber: o.orderNumber,
      patientName,
      patientIdentifier: patientIdentifier || '—',
      age: String(group.age),
      sex: group.sex,
      orderDate: o.dateActivated ? formatDate(parseDate(o.dateActivated), { mode: 'standard', time: false }) : '—',
      procedureLabel,
      procedure: o.concept?.display ?? o.display ?? '—',
      findings: meta.report,
      reviewedBy: meta.validatedBy ?? meta.doneBy ?? '',
      closeModal: () => dispose(),
    });
  }

  async function handleApprove(o: OrderSummary) {
    try {
      const meta = parseResultComment(o.fulfillerComment);
      const finalComment = buildResultComment({
        pendingReview: false,
        doneBy: meta.doneBy,
        validatedBy: currentUserName || null,
        report: meta.report,
      });
      await updateOrderFulfillerStatus(o.uuid, 'COMPLETED', finalComment);
      showSnackbar({
        title: t('resultsApproved', 'Results approved'),
        subtitle: o.concept?.display ?? '',
        kind: 'success',
        isLowContrast: false,
      });
      onChanged();
    } catch (err: any) {
      showSnackbar({
        title: t('actionFailed', 'Action failed'),
        subtitle: err?.responseBody?.error?.message || err?.message,
        kind: 'error',
        isLowContrast: false,
      });
    }
  }

  if (isLoading) {
    return <DataTableSkeleton headers={headers} showHeader={false} showToolbar={false} />;
  }
  if (error) {
    return (
      <p style={{ textAlign: 'center', padding: '2rem', color: '#da1e28' }}>
        {t('errorLoadingOrders', 'Error loading orders')}
      </p>
    );
  }
  if (rows.length === 0) {
    return null; // empty state is rendered by parent
  }

  return (
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
                const group = groups.find((g) => g.patientUuid === row.id);
                return (
                  <React.Fragment key={row.id}>
                    <TableExpandRow {...getRowProps({ row })}>
                      {row.cells.map((c: any) => (
                        <TableCell key={c.id}>{c.value}</TableCell>
                      ))}
                    </TableExpandRow>
                    {row.isExpanded && group && (
                      <TableExpandedRow colSpan={hdrs.length + 1}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
                          {group.orders.map((o) => {
                            const st = statusVisual(o);
                            const u = urgencyVisual(o.urgency);
                            const isNotPicked = o.fulfillerStatus === null;
                            const isInProgress =
                              o.fulfillerStatus === 'IN_PROGRESS' || o.fulfillerStatus === 'RECEIVED';
                            const isPendingReview = isPendingReviewOrder(o);
                            const isFullyCompleted = o.fulfillerStatus === 'COMPLETED' && !isPendingReview;
                            const isDeclined =
                              o.fulfillerStatus === 'DECLINED' || o.fulfillerStatus === 'EXCEPTION';
                            const meta = parseResultComment(o.fulfillerComment);
                            const resultsEntered = isFullyCompleted || isPendingReview;
                            return (
                              <div
                                key={o.uuid}
                                style={{
                                  background: '#fff',
                                  padding: '1rem 1.5rem',
                                  borderTop: '1px solid #e0e0e0',
                                }}>
                                <DetailRow label={t('urgency', 'Urgency')}>
                                  <Tag type={u.type}>{u.label}</Tag>
                                </DetailRow>
                                <DetailRow label={t('xOrdered', '{{noun}} ordered', { noun: capitalize(kindNoun) })}>
                                  {o.concept?.display ?? '—'}
                                </DetailRow>
                                <DetailRow label={t('status', 'Status')}>
                                  <Tag type={st.type}>{st.label}</Tag>
                                </DetailRow>
                                <DetailRow label={t('orderNumber', 'Order number')}>{o.orderNumber}</DetailRow>
                                <DetailRow label={t('orderDate', 'Order date')}>
                                  {o.dateActivated
                                    ? formatDate(parseDate(o.dateActivated), { mode: 'standard', time: true })
                                    : '—'}
                                </DetailRow>
                                <DetailRow label={t('orderedBy', 'Ordered by')}>{o.orderer?.display ?? '—'}</DetailRow>
                                {resultsEntered && (
                                  <DetailRow label={t('doneBy', 'Done by')}>{meta.doneBy ?? '—'}</DetailRow>
                                )}
                                {isFullyCompleted && (
                                  <DetailRow label={t('validatedBy', 'Validated by')}>
                                    {meta.validatedBy ?? '—'}
                                  </DetailRow>
                                )}
                                <DetailRow label={t('instructions', 'Instructions')}>
                                  {o.instructions?.trim() || t('noInstructions', 'No instructions are provided.')}
                                </DetailRow>
                                {isDeclined && (
                                  <DetailRow label={t('reasonForDecline', 'Reason for decline')}>
                                    {o.fulfillerComment?.trim() || t('noReasonProvided', 'No reason provided.')}
                                  </DetailRow>
                                )}
                                {resultsEntered && meta.report ? (
                                  <DetailRow label={t('results', 'Results')}>{meta.report}</DetailRow>
                                ) : null}
                                {kind === 'imaging' && (isFullyCompleted || isPendingReview) && o.patient?.uuid && (
                                  <OrderAttachments patientUuid={o.patient.uuid} orderNumber={o.orderNumber} />
                                )}
                                {resultsEntered && (
                                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '1rem' }}>
                                    <Button kind="tertiary" size="md" onClick={() => launchPrintReport(o, group)}>
                                      {t('printReport', 'Print report')}
                                    </Button>
                                  </div>
                                )}

                                {/* Action row: primary action (left) + Reject link (right) */}
                                {!isFullyCompleted && !isDeclined && (
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'flex-end',
                                      gap: '1.5rem',
                                      alignItems: 'center',
                                      paddingTop: '1rem',
                                    }}>
                                    {isNotPicked && (
                                      <Button kind="primary" onClick={() => launchPickConfirm(o)}>
                                        {t('pickRequest', 'Pick {{noun}}', { noun: requestNoun, interpolation: { escapeValue: false } })}
                                      </Button>
                                    )}
                                    {isInProgress && (
                                      <Button kind="primary" onClick={() => launchEnterResults(o)}>
                                        {t('addResultsButton', 'Add {{noun}} results', { noun: capitalize(kindNoun) })}
                                      </Button>
                                    )}
                                    {isPendingReview && (
                                      <Button kind="primary" onClick={() => handleApprove(o)}>
                                        {t('approveResults', 'Approve results')}
                                      </Button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => launchReject(o)}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#da1e28',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                      }}>
                                      {t('rejectRequest', 'Reject {{noun}}', { noun: requestNoun, interpolation: { escapeValue: false } })}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
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
  );
};

const OrderAttachments: React.FC<{ patientUuid: string; orderNumber: string }> = ({ patientUuid, orderNumber }) => {
  const { t } = useTranslation();
  const { attachments: allAttachments, isLoading } = usePatientAttachments(patientUuid);

  // Attachments are stored against the patient, but the upload tags the caption
  // with "<orderNumber> - <concept>" (see enter-results.workspace), so we can
  // scope them back to this specific order.
  const attachments = useMemo(
    () => allAttachments.filter((a) => (a.comment ?? '').trim().startsWith(orderNumber)),
    [allAttachments, orderNumber],
  );

  return (
    <div
      style={{
        marginTop: '1rem',
        border: '1px solid #e0e0e0',
        padding: '1rem 1.5rem 1.5rem',
      }}>
      <div style={{ fontWeight: 700, color: '#161616', fontSize: '1rem' }}>{t('attachments', 'Attachments')}</div>
      <div style={{ width: '2rem', height: '3px', background: '#0f6d3d', margin: '0.25rem 0 1rem' }} />

      {isLoading ? (
        <span style={{ color: '#6f6f6f' }}>{t('loading', 'Loading…')}</span>
      ) : attachments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '1.5rem 0', color: '#525252' }}>
          <ClipboardGlyph />
          <p style={{ fontWeight: 600, margin: '0.5rem 0' }}>
            {t('noAttachmentsForOrder', 'There are no attachments to display for this order')}
          </p>
          <ConfigurableLink to={`\${openmrsSpaBase}/patient/${patientUuid}/chart/Attachments`}>
            {t('recordAttachments', 'Record attachments')}
          </ConfigurableLink>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
          {attachments.map((a: PatientAttachment) => {
            const href = attachmentBytesUrl(a.uuid);
            return (
              <a
                key={a.uuid}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={a.comment ?? ''}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textDecoration: 'none',
                  color: '#0f62fe',
                  width: '8rem',
                }}>
                {isImageAttachment(a) ? (
                  <img
                    src={href}
                    alt={a.comment ?? t('attachment', 'Attachment')}
                    style={{
                      width: '8rem',
                      height: '8rem',
                      objectFit: 'cover',
                      border: '1px solid #e0e0e0',
                      borderRadius: '4px',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '8rem',
                      height: '8rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid #e0e0e0',
                      borderRadius: '4px',
                      background: '#f4f4f4',
                      fontSize: '0.75rem',
                      color: '#525252',
                      padding: '0.5rem',
                      textAlign: 'center',
                    }}>
                    {(a.bytesMimeType ?? t('file', 'File')).toUpperCase()}
                  </div>
                )}
                <span
                  style={{
                    fontSize: '0.75rem',
                    marginTop: '0.25rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '8rem',
                  }}>
                  {a.comment?.trim() || t('viewFile', 'View file')}
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ClipboardGlyph: React.FC = () => (
  <svg width="56" height="56" viewBox="0 0 32 32" fill="none" aria-hidden="true" style={{ opacity: 0.4 }}>
    <rect x="8" y="5" width="16" height="22" rx="1.5" stroke="#8d8d8d" strokeWidth="1.5" fill="#fff" />
    <rect x="12" y="3" width="8" height="4" rx="1" stroke="#8d8d8d" strokeWidth="1.5" fill="#fff" />
    <line x1="11" y1="12" x2="21" y2="12" stroke="#c6c6c6" strokeWidth="1.5" />
    <line x1="11" y1="16" x2="21" y2="16" stroke="#c6c6c6" strokeWidth="1.5" />
    <line x1="11" y1="20" x2="17" y2="20" stroke="#c6c6c6" strokeWidth="1.5" />
  </svg>
);

const DetailRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '12rem 1fr',
      gap: '1rem',
      padding: '0.5rem 0',
      borderBottom: '1px solid #f4f4f4',
    }}>
    <span style={{ fontWeight: 600, color: '#393939' }}>{label}:</span>
    <span style={{ color: '#161616', whiteSpace: 'pre-wrap' }}>{children}</span>
  </div>
);

function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export default OrdersByPatient;
