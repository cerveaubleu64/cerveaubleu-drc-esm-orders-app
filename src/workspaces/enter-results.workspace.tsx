import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ButtonSet,
  FileUploader,
  Form,
  InlineLoading,
  Search,
  Select,
  SelectItem,
  Stack,
  Tag,
  TextArea,
  TextInput,
} from '@carbon/react';
import {
  OpenmrsDatePicker,
  showSnackbar,
  useDebounce,
  useSession,
  Workspace2,
  type Workspace2DefinitionProps,
} from '@openmrs/esm-framework';
import { updateOrderFulfillerStatus } from '../api/orders-list.resource';
import { useUserSearch, userDisplayName, type UserSummary } from '../api/users.resource';
import {
  attachmentBytesUrl,
  deletePatientAttachment,
  isImageAttachment,
  uploadPatientAttachment,
  usePatientAttachments,
  type PatientAttachment,
} from '../api/attachments.resource';
import { buildResultComment, parseResultComment } from '../results-meta';

export interface EnterResultsWorkspaceProps {
  orderUuid: string;
  orderNumber: string;
  patientUuid: string;
  conceptDisplay: string;
  /** Localized title noun ("imaging" / "procedure"). */
  kindNoun: string;
  /** When true, show a file uploader so images / PDFs can be attached. */
  allowFileUpload?: boolean;
  /** Existing report text to pre-fill when editing already-entered results. */
  initialResult?: string;
  /** Full existing fulfillerComment, used to pre-fill the procedure metadata. */
  initialComment?: string;
  /**
   * When true, show the procedure-specific result fields (start / end datetime,
   * outcome, participants, complications).
   */
  procedureFields?: boolean;
  /**
   * When true, the order goes to a "Pending Review" stage instead of straight
   * to Completed. Implemented by prefixing fulfillerComment with the marker
   * `[PENDING_REVIEW]` since OpenMRS has no native pending-review status.
   */
  requiresReview?: boolean;
  /** Called after a successful save so the parent table can refresh. */
  onSuccess?: () => void;
}

const ACCEPTED_FILE_TYPES = ['image/*', 'application/pdf'];
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file

/** Combine an OpenmrsDatePicker date and an HH:mm time into a local ISO string. */
function toLocalIso(date: Date | null, time: string): string | null {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}T${time && /^\d{2}:\d{2}$/.test(time) ? time : '00:00'}`;
}

function fromLocalIso(iso: string | null): { date: Date | null; time: string } {
  if (!iso) return { date: null, time: '' };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: null, time: '' };
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return { date: d, time: `${hh}:${mm}` };
}

/** A search box whose results can be added as removable tags. */
const TagPicker: React.FC<{
  id: string;
  labelText: string;
  placeholder: string;
  query: string;
  onQueryChange: (q: string) => void;
  options: Array<{ key: string; label: string }>;
  optionsLoading?: boolean;
  selected: string[];
  onAdd: (label: string) => void;
  onRemove: (label: string) => void;
  disabled?: boolean;
}> = ({ id, labelText, placeholder, query, onQueryChange, options, optionsLoading, selected, onAdd, onRemove, disabled }) => {
  return (
    <div>
      <p style={{ fontSize: '0.75rem', color: '#525252', marginBottom: '0.25rem' }}>{labelText}</p>
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.5rem' }}>
          {selected.map((s) => (
            <Tag key={s} type="blue" filter onClose={() => onRemove(s)} disabled={disabled}>
              {s}
            </Tag>
          ))}
        </div>
      )}
      <Search
        id={id}
        size="lg"
        labelText={labelText}
        placeholder={placeholder}
        value={query}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onQueryChange(e.target.value ?? '')}
        disabled={disabled}
      />
      {query.trim().length > 0 && (
        <div style={{ border: '1px solid #e0e0e0', borderTop: 'none', maxHeight: '10rem', overflowY: 'auto' }}>
          {optionsLoading ? (
            <div style={{ padding: '0.5rem' }}>
              <InlineLoading description="…" />
            </div>
          ) : options.length === 0 ? (
            <p style={{ padding: '0.5rem', color: '#6f6f6f', fontSize: '0.875rem' }}>—</p>
          ) : (
            options
              .filter((o) => !selected.includes(o.label))
              .map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => {
                    onAdd(o.label);
                    onQueryChange('');
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.5rem 0.75rem',
                    background: '#fff',
                    border: 'none',
                    borderBottom: '1px solid #f4f4f4',
                    cursor: 'pointer',
                  }}>
                  {o.label}
                </button>
              ))
          )}
        </div>
      )}
    </div>
  );
};

const EnterResultsWorkspace: React.FC<Workspace2DefinitionProps<EnterResultsWorkspaceProps>> = ({
  closeWorkspace,
  workspaceProps,
}) => {
  const { t } = useTranslation();
  const session = useSession();
  const currentUserName = session?.user?.person?.display ?? session?.user?.display ?? '';
  const orderUuid = workspaceProps?.orderUuid;
  const orderNumber = workspaceProps?.orderNumber ?? '';
  const patientUuid = workspaceProps?.patientUuid ?? '';
  const conceptDisplay = workspaceProps?.conceptDisplay ?? '—';
  const kindNoun = workspaceProps?.kindNoun ?? '';
  const allowFileUpload = workspaceProps?.allowFileUpload ?? false;
  const procedureFields = workspaceProps?.procedureFields ?? false;
  const requiresReview = workspaceProps?.requiresReview ?? false;
  const onSuccess = workspaceProps?.onSuccess;

  // Pre-fill everything from the existing comment when re-editing results.
  const initialMeta = useMemo(
    () => parseResultComment(workspaceProps?.initialComment ?? null),
    [workspaceProps?.initialComment],
  );

  const [result, setResult] = useState(workspaceProps?.initialResult ?? initialMeta.report ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  // Procedure-specific result fields.
  const initialStart = fromLocalIso(initialMeta.startDatetime);
  const initialEnd = fromLocalIso(initialMeta.endDatetime);
  const [startDate, setStartDate] = useState<Date | null>(initialStart.date);
  const [startTime, setStartTime] = useState(initialStart.time);
  const [endDate, setEndDate] = useState<Date | null>(initialEnd.date);
  const [endTime, setEndTime] = useState(initialEnd.time);
  const [outcome, setOutcome] = useState(initialMeta.outcome ?? '');
  const [participants, setParticipants] = useState<string[]>(initialMeta.participants);
  const [complications, setComplications] = useState(initialMeta.complications ?? '');
  const [participantQuery, setParticipantQuery] = useState('');
  const debouncedParticipantQuery = useDebounce(participantQuery);
  const { users, isLoading: usersLoading } = useUserSearch(procedureFields ? debouncedParticipantQuery : '');

  const outcomeOptions = [
    t('outcomeSuccessful', 'Réussi'),
    t('outcomePartiallySuccessful', 'Partiellement réussi'),
    t('outcomeNotSuccessful', 'Non réussi'),
  ];

  // Existing attachments already saved for this order (so the user can keep or
  // remove them while editing). Scoped to this order via the caption prefix.
  const { attachments: allAttachments, isLoading: attachmentsLoading, mutate: mutateAttachments } =
    usePatientAttachments(allowFileUpload ? patientUuid : undefined);
  const existingAttachments = allAttachments.filter((a) => (a.comment ?? '').trim().startsWith(orderNumber));

  async function handleDeleteExisting(uuid: string) {
    try {
      await deletePatientAttachment(uuid);
      await mutateAttachments();
      showSnackbar({ title: t('attachmentRemoved', 'Attachment removed'), kind: 'success', isLowContrast: true });
    } catch (err: any) {
      showSnackbar({
        title: t('actionFailed', 'Action failed'),
        subtitle: err?.responseBody?.error?.message || err?.message,
        kind: 'error',
        isLowContrast: false,
      });
    }
  }

  const hasFiles = files.length > 0;
  const procedureFieldsValid =
    !procedureFields || (!!startDate && !!endDate && !!outcome && result.trim().length > 0);
  const canSubmit =
    !!orderUuid &&
    !submitting &&
    procedureFieldsValid &&
    (result.trim().length > 0 || (allowFileUpload && hasFiles));

  function handleFileSelect(e: any, data: any) {
    // Carbon's <FileUploader> passes the native change event (files on
    // e.target.files). <FileUploaderDropContainer> instead passes
    // { addedFiles }. Support both so files reliably enter state.
    const fromEvent: File[] = e?.target?.files ? Array.from(e.target.files as FileList) : [];
    const fromData: File[] = (data?.addedFiles ?? [])
      .map((item: any) => item?.file ?? item)
      .filter(Boolean);
    const candidates = fromEvent.length ? fromEvent : fromData;
    if (candidates.length === 0) return;

    const accepted: File[] = [];
    for (const f of candidates) {
      if ((f.size ?? 0) > MAX_FILE_BYTES) {
        showSnackbar({
          title: t('fileTooLarge', 'File too large'),
          subtitle: t('fileSizeLimit', '{{name}} exceeds the 10 MB limit', { name: f.name }),
          kind: 'warning',
          isLowContrast: false,
        });
        continue;
      }
      accepted.push(f);
    }
    // De-dupe by name+size so re-selecting the same file doesn't double-add.
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name + ':' + f.size));
      const merged = [...prev];
      for (const f of accepted) {
        const key = f.name + ':' + f.size;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(f);
        }
      }
      return merged;
    });
  }

  function handleDelete(_e: any, data: any) {
    const name = data?.name ?? data?.uuid;
    if (!name) return;
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !orderUuid) return;
    setSubmitting(true);
    try {
      // Upload attachments first (if any) so we don't mark the order COMPLETED
      // if uploads fail mid-way.
      if (allowFileUpload && hasFiles && patientUuid) {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          setProgress(t('uploadingFile', 'Uploading {{name}} ({{current}}/{{total}})', {
            name: f.name,
            current: i + 1,
            total: files.length,
          }));
          await uploadPatientAttachment(f, patientUuid, `${orderNumber} - ${conceptDisplay}`);
        }
      }
      setProgress(t('savingResults', 'Saving results…'));
      const finalComment = buildResultComment({
        pendingReview: requiresReview,
        doneBy: currentUserName || null,
        ...(procedureFields
          ? {
              startDatetime: toLocalIso(startDate, startTime),
              endDatetime: toLocalIso(endDate, endTime),
              outcome: outcome || null,
              participants,
              complications,
            }
          : {}),
        report: result.trim(),
      });
      await updateOrderFulfillerStatus(orderUuid, 'COMPLETED', finalComment);
      showSnackbar({
        title: t('resultSaved', 'Result saved'),
        subtitle: conceptDisplay,
        kind: 'success',
        isLowContrast: false,
      });
      onSuccess?.();
      closeWorkspace?.({ closeWindow: true, discardUnsavedChanges: true });
    } catch (err: any) {
      showSnackbar({
        title: t('actionFailed', 'Action failed'),
        subtitle: err?.responseBody?.error?.message || err?.message,
        kind: 'error',
        isLowContrast: false,
      });
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  return (
    <Workspace2 title={t('enterResults', 'Enter {{noun}} results', { noun: kindNoun })}>
      <Form
        onSubmit={handleSubmit}
        style={{ padding: '1rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Stack gap={5} style={{ flex: 1 }}>
          <p style={{ fontWeight: 600 }}>{conceptDisplay}</p>

          {procedureFields && (
            <>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <OpenmrsDatePicker
                  id="procedure-start-date"
                  labelText={t('startDate', 'Start date')}
                  value={startDate}
                  onChange={(date?: Date | null) => setStartDate(date ?? null)}
                />
                <TextInput
                  id="procedure-start-time"
                  type="time"
                  labelText={t('startTime', 'Start time')}
                  value={startTime}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartTime(e.target.value)}
                  disabled={submitting}
                  style={{ minWidth: '8rem' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <OpenmrsDatePicker
                  id="procedure-end-date"
                  labelText={t('endDate', 'End date')}
                  value={endDate}
                  onChange={(date?: Date | null) => setEndDate(date ?? null)}
                />
                <TextInput
                  id="procedure-end-time"
                  type="time"
                  labelText={t('endTime', 'End time')}
                  value={endTime}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndTime(e.target.value)}
                  disabled={submitting}
                  style={{ minWidth: '8rem' }}
                />
              </div>
              <Select
                id="procedure-outcome"
                labelText={t('procedureOutcome', 'Procedure outcome')}
                value={outcome}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setOutcome(e.target.value)}
                disabled={submitting}>
                <SelectItem value="" text={t('chooseAnOption', 'Choose an option')} />
                {outcomeOptions.map((o) => (
                  <SelectItem key={o} value={o} text={o} />
                ))}
              </Select>
            </>
          )}

          <TextArea
            id="result-text"
            labelText={
              allowFileUpload
                ? t('reportOptional', 'Report (optional if attaching images)')
                : t('results', 'Results')
            }
            placeholder={t('enterResultsPlaceholder', 'Enter {{noun}} results / report', { noun: kindNoun })}
            value={result}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setResult(e.target.value)}
            rows={8}
            disabled={submitting}
          />

          {procedureFields && (
            <>
              <TagPicker
                id="procedure-participants"
                labelText={t('participants', 'Participant(s)')}
                placeholder={t('searchUsers', 'Search for a system user')}
                query={participantQuery}
                onQueryChange={setParticipantQuery}
                options={users.map((u: UserSummary) => ({ key: u.uuid, label: userDisplayName(u) }))}
                optionsLoading={usersLoading}
                selected={participants}
                onAdd={(label) => setParticipants((prev) => [...prev, label])}
                onRemove={(label) => setParticipants((prev) => prev.filter((p) => p !== label))}
                disabled={submitting}
              />
              <TextArea
                id="procedure-complications"
                labelText={t('complications', 'Complications')}
                placeholder={t('complicationsPlaceholder', 'Describe any complications (optional)')}
                value={complications}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setComplications(e.target.value)}
                rows={3}
                disabled={submitting}
              />
            </>
          )}

          {allowFileUpload && existingAttachments.length > 0 && (
            <div>
              <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                {t('existingAttachments', 'Existing attachments')}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                {existingAttachments.map((a: PatientAttachment) => {
                  const href = attachmentBytesUrl(a.uuid);
                  return (
                    <div key={a.uuid} style={{ width: '7rem', textAlign: 'center' }}>
                      <a href={href} target="_blank" rel="noopener noreferrer">
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
                      <Button
                        kind="danger--ghost"
                        size="sm"
                        disabled={submitting}
                        onClick={() => handleDeleteExisting(a.uuid)}>
                        {t('delete', 'Delete')}
                      </Button>
                    </div>
                  );
                })}
              </div>
              {attachmentsLoading && <InlineLoading description={t('loading', 'Loading…')} />}
            </div>
          )}
          {allowFileUpload && (
            <div>
              <FileUploader
                labelTitle={t('attachImages', 'Attach images')}
                labelDescription={t(
                  'attachImagesHelp',
                  'Accepted: images and PDF, up to 10 MB each. Files are attached to the patient record.',
                )}
                buttonLabel={t('addFile', 'Add file')}
                multiple
                accept={ACCEPTED_FILE_TYPES}
                filenameStatus="edit"
                onChange={handleFileSelect}
                onDelete={handleDelete}
                disabled={submitting}
              />
              {files.length > 0 && (
                <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#525252' }}>
                  {t('filesQueued', '{{count}} file(s) ready to upload', { count: files.length })}
                </p>
              )}
            </div>
          )}
          {progress && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <InlineLoading description={progress} />
            </div>
          )}
          <p style={{ fontSize: '0.875rem', color: '#525252' }}>
            {t('addResultsHelp', 'Saving will mark this request as Completed.')}
          </p>
        </Stack>
        <ButtonSet style={{ marginTop: '1rem' }}>
          <Button
            kind="secondary"
            onClick={() => closeWorkspace?.({ closeWindow: true, discardUnsavedChanges: true })}
            disabled={submitting}>
            {t('discard', 'Discard')}
          </Button>
          <Button kind="primary" type="submit" disabled={!canSubmit}>
            {submitting ? (
              <InlineLoading description={t('saving', 'Saving…')} />
            ) : (
              t('saveAndClose', 'Save and close')
            )}
          </Button>
        </ButtonSet>
      </Form>
    </Workspace2>
  );
};

export default EnterResultsWorkspace;
