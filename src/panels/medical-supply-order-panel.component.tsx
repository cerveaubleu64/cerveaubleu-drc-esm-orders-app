import React from 'react';
import { MaterialOrderIcon } from '@openmrs/esm-framework';
import OrderPanel from './order-panel.component';

const MedicalSupplyOrderPanel: React.FC<{ patientUuid?: string }> = ({ patientUuid }) => (
  <OrderPanel
    patientUuid={patientUuid}
    kind="medicalSupply"
    titleKey="medicalSupplyOrders"
    titleDefault="Medical supply orders"
    addLabelKey="addMedicalSupplyOrder"
    addLabelDefault="Add"
    workspaceName="add-medical-supply-order"
    TitleIcon={MaterialOrderIcon}
    accentColor="#8a3ffc"
  />
);

export default MedicalSupplyOrderPanel;
