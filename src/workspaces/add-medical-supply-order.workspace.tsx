import React from 'react';
import { type Workspace2DefinitionProps } from '@openmrs/esm-framework';
import AddOrderWorkspace from './add-order.workspace';

const AddMedicalSupplyOrderWorkspace: React.FC<Workspace2DefinitionProps<{ patientUuid?: string }>> = (props) => (
  <AddOrderWorkspace {...props} workspaceProps={{ ...props.workspaceProps, kind: 'medicalSupply' }} />
);

export default AddMedicalSupplyOrderWorkspace;
