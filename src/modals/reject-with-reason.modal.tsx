import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineLoading, ModalBody, ModalFooter, ModalHeader, TextArea } from '@carbon/react';
import { showSnackbar } from '@openmrs/esm-framework';
import { updateOrderFulfillerStatus } from '../api/orders-list.resource';

interface RejectWithReasonModalProps {
  closeModal: () => void;
  orderUuid: string;
  orderNumber: string;
  requestNoun: string;
  /** "Test type" / "Imaging type" / "Procedure type" — already localized. */
  typeLabel: string;
  /** Concept display value. */
  conceptDisplay: string;
  onSuccess: () => void;
}

const MAX_LEN = 500;

const RejectWithReasonModal: React.FC<RejectWithReasonModalProps> = ({
  closeModal,
  orderUuid,
  orderNumber,
  requestNoun,
  typeLabel,
  conceptDisplay,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = reason.trim().length > 0 && !submitting;

  async function handleConfirm() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await updateOrderFulfillerStatus(orderUuid, 'DECLINED', reason.trim());
      showSnackbar({
        title: t('requestRejected', 'Request rejected'),
        kind: 'success',
        isLowContrast: false,
      });
      onSuccess();
      closeModal();
    } catch (err: any) {
      showSnackbar({
        title: t('actionFailed', 'Action failed'),
        subtitle: err?.responseBody?.error?.message || err?.message,
        kind: 'error',
        isLowContrast: false,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <ModalHeader
        closeModal={closeModal}
        title={`${t('rejectRequest', 'Reject {{noun}}', { noun: requestNoun, interpolation: { escapeValue: false } })} [${orderNumber}]`}
      />
      <ModalBody>
        <p style={{ marginBottom: '1rem' }}>
          {typeLabel}: {conceptDisplay}
        </p>
        <TextArea
          id="reject-reason"
          labelText={t('fulfillerComment', 'Fulfiller comment')}
          value={reason}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            setReason(e.target.value.slice(0, MAX_LEN))
          }
          rows={4}
          maxCount={MAX_LEN}
          enableCounter
          required
        />
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={closeModal} disabled={submitting}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button kind="danger" onClick={handleConfirm} disabled={!canSubmit}>
          {submitting ? (
            <InlineLoading description={t('processing', 'Processing…')} />
          ) : (
            t('rejectAction', 'Reject')
          )}
        </Button>
      </ModalFooter>
    </div>
  );
};

export default RejectWithReasonModal;
