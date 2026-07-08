import React from 'react';
import { ProcedureOrderIcon } from '@openmrs/esm-framework';
import OrderPanel from './order-panel.component';

const ProcedureOrderPanel: React.FC<{ patientUuid?: string }> = ({ patientUuid }) => (
  <OrderPanel
    patientUuid={patientUuid}
    kind="procedure"
    titleKey="proceduresOrders"
    titleDefault="Procedure orders"
    addLabelKey="addProcedureOrder"
    addLabelDefault="Add"
    workspaceName="add-procedure-order"
    TitleIcon={ProcedureOrderIcon}
    accentColor="#198038"
  />
);

export default ProcedureOrderPanel;
