import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ButtonSet,
  FileUploader,
  Form,
  InlineLoading,
  Stack,
  TextArea,
} from '@carbon/react';
import { showSnackbar, useSession, Workspace2, type Workspace2DefinitionProps } from '@openmrs/esm-framework';
import { updateOrderFulfillerStatus } from '../api/orders-list.resource';
import {
  attachmentBytesUrl,
  deletePatientAttachment,
  isImageAttachment,
  uploadPatientAttachment,
  usePatientAttachments,
  type PatientAttachment,
} from '../api/attachments.resource';
import { buildResultComment } from '../results-meta';

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
  const requiresReview = workspaceProps?.requiresReview ?? false;
  const onSuccess = workspaceProps?.onSuccess;

  const [result, setResult] = useState(workspaceProps?.initialResult ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

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
  const canSubmit =
    !!orderUuid && !submitting && (result.trim().length > 0 || (allowFileUpload && hasFiles));

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
