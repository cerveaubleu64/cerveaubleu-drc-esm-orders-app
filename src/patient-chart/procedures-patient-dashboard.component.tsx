import React from 'react';
import OrdersPatientDashboard from './orders-patient-dashboard.component';

interface ProceduresPatientDashboardProps {
  patientUuid: string;
}

const ProceduresPatientDashboard: React.FC<ProceduresPatientDashboardProps> = ({ patientUuid }) => (
  <OrdersPatientDashboard patientUuid={patientUuid} kind="procedure" />
);

export default ProceduresPatientDashboard;
