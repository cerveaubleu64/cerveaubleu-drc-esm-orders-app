import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineLoading, ModalBody, ModalFooter, ModalHeader } from '@carbon/react';
import { showSnackbar } from '@openmrs/esm-framework';
import { updateOrderFulfillerStatus } from '../api/orders-list.resource';

interface PickConfirmModalProps {
  closeModal: () => void;
  orderUuid: string;
  /** Localized noun used in the title and button, e.g. "imaging request" or "procedure". */
  requestNoun: string;
  onSuccess: () => void;
}

const PickConfirmModal: React.FC<PickConfirmModalProps> = ({ closeModal, orderUuid, requestNoun, onSuccess }) => {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await updateOrderFulfillerStatus(orderUuid, 'IN_PROGRESS');
      showSnackbar({
        title: t('requestPicked', 'Request picked'),
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
      <ModalHeader closeModal={closeModal} title={t('pickRequest', 'Pick {{noun}}', { noun: requestNoun, interpolation: { escapeValue: false } })} />
      <ModalBody>
        <p>
          {t(
            'pickConfirmBody',
            'Continuing will update the request status to "In Progress" and advance it to the next stage. Are you sure you want to proceed?',
          )}
        </p>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={closeModal} disabled={submitting}>
          {t('discard', 'Discard')}
        </Button>
        <Button kind="primary" onClick={handleConfirm} disabled={submitting}>
          {submitting ? (
            <InlineLoading description={t('processing', 'Processing…')} />
          ) : (
            t('pickUpRequest', 'Pick up {{noun}}', { noun: requestNoun, interpolation: { escapeValue: false } })
          )}
        </Button>
      </ModalFooter>
    </div>
  );
};

export default PickConfirmModal;
