import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ModalBody, ModalFooter, ModalHeader } from '@carbon/react';

export interface PrintReportModalProps {
  closeModal: () => void;
  /** Localized noun for the report heading, e.g. "Imaging" / "Procedure". */
  reportKind: string;
  orderNumber: string;
  patientName: string;
  patientIdentifier: string;
  age: string;
  sex: string;
  orderDate: string;
  /** Heading for the ordered-item section ("Radiology / Imaging" or "Procedure"). */
  procedureLabel: string;
  procedure: string;
  findings: string;
  reviewedBy: string;
}

const LOGO_URL = '/openmrs/spa/logo.png';

const PrintReportModal: React.FC<PrintReportModalProps> = (props) => {
  const { t } = useTranslation();
  const {
    closeModal,
    reportKind,
    orderNumber,
    patientName,
    patientIdentifier,
    age,
    sex,
    orderDate,
    procedureLabel,
    procedure,
    findings,
    reviewedBy,
  } = props;

  const title = t('reportTitle', '{{kind}} report', { kind: reportKind }).toUpperCase() + ` - ${orderNumber}`;

  function handlePrint() {
    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) return;
    const esc = (s: string) =>
      (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'IBM Plex Sans', Arial, sans-serif; color: #161616; margin: 0; padding: 2.5rem; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 2rem; }
  .head h1 { font-size: 1.25rem; font-weight: 600; margin: 0; }
  .logo { max-height: 70px; max-width: 220px; object-fit: contain; }
  h2 { font-size: 0.95rem; font-weight: 700; margin: 1.5rem 0 0.25rem; }
  p { margin: 0.15rem 0; line-height: 1.5; }
  .divider { border-top: 1px solid #e0e0e0; margin: 2.5rem 0 1.5rem; }
  .reviewed { display: flex; gap: 3rem; margin-bottom: 2rem; }
  .sign { margin-top: 1.5rem; }
  @media print { body { padding: 1rem; } }
</style>
</head>
<body>
  <div class="head">
    <h1>${esc(title)}</h1>
    <img class="logo" src="${LOGO_URL}" alt="" onerror="this.style.display='none'" />
  </div>

  <h2>${esc(t('reportSummaryTo', 'Report summary to'))}</h2>
  <p>${esc(t('name', 'Name'))}: ${esc(patientName)}</p>
  <p>${esc(t('identifier', 'Identifier'))}: ${esc(patientIdentifier)}</p>
  <p>${esc(t('age', 'Age'))}: ${esc(age)}</p>
  <p>${esc(t('gender', 'Gender'))}: ${esc(sex)}</p>
  <p>${esc(t('orderDate', 'Order Date'))}: ${esc(orderDate)}</p>

  <h2>${esc(procedureLabel)}</h2>
  <p>${esc(procedure)}</p>

  <h2>${esc(t('findings', 'Findings'))}</h2>
  <p style="white-space: pre-wrap;">${esc(findings)}</p>

  <div class="divider"></div>
  <div class="reviewed">
    <span>${esc(t('reviewedAuthorizedBy', 'Results Reviewed / Authorized by'))} :</span>
    <strong>${esc(reviewedBy || '—')}</strong>
  </div>
  <p class="sign">${esc(t('sign', 'Sign'))} : ...........................................</p>

  <script>window.onload = function(){ window.print(); };</script>
</body>
</html>`);
    win.document.close();
  }

  const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <p style={{ margin: '0.15rem 0', lineHeight: 1.5 }}>
      <span>{label}: </span>
      <span>{children}</span>
    </p>
  );

  return (
    <div>
      <ModalHeader closeModal={closeModal} title={title} />
      <ModalBody>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
          <img
            src={LOGO_URL}
            alt=""
            style={{ maxHeight: 60, maxWidth: 200, objectFit: 'contain' }}
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
        </div>

        <h5 style={{ fontWeight: 700, marginTop: '0.5rem' }}>{t('reportSummaryTo', 'Report summary to')}</h5>
        <Row label={t('name', 'Name')}>{patientName}</Row>
        <Row label={t('identifier', 'Identifier')}>{patientIdentifier}</Row>
        <Row label={t('age', 'Age')}>{age}</Row>
        <Row label={t('gender', 'Gender')}>{sex}</Row>
        <Row label={t('orderDate', 'Order Date')}>{orderDate}</Row>

        <h5 style={{ fontWeight: 700, marginTop: '1.25rem' }}>{procedureLabel}</h5>
        <p style={{ margin: '0.15rem 0' }}>{procedure}</p>

        <h5 style={{ fontWeight: 700, marginTop: '1.25rem' }}>{t('findings', 'Findings')}</h5>
        <p style={{ margin: '0.15rem 0', whiteSpace: 'pre-wrap' }}>{findings || '—'}</p>

        <div style={{ borderTop: '1px solid #e0e0e0', margin: '2rem 0 1.25rem' }} />
        <p style={{ margin: '0.15rem 0' }}>
          {t('reviewedAuthorizedBy', 'Results Reviewed / Authorized by')} : <strong>{reviewedBy || '—'}</strong>
        </p>
        <p style={{ marginTop: '1.25rem' }}>{t('sign', 'Sign')} : ...........................................</p>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={closeModal}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button kind="primary" onClick={handlePrint}>
          {t('print', 'Print')}
        </Button>
      </ModalFooter>
    </div>
  );
};

export default PrintReportModal;
