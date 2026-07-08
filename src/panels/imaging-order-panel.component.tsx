import React from 'react';
import { ImageMedicalIcon } from '@openmrs/esm-framework';
import OrderPanel from './order-panel.component';

const ImagingOrderPanel: React.FC<{ patientUuid?: string }> = ({ patientUuid }) => (
  <OrderPanel
    patientUuid={patientUuid}
    kind="imaging"
    titleKey="imagingOrders"
    titleDefault="Imaging orders"
    addLabelKey="addImagingOrder"
    addLabelDefault="Add"
    workspaceName="add-imaging-order"
    TitleIcon={ImageMedicalIcon}
    accentColor="#9f1853"
  />
);

export default ImagingOrderPanel;
