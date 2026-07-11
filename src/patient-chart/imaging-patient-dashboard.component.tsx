import React from 'react';
import OrdersPatientDashboard from './orders-patient-dashboard.component';

interface ImagingPatientDashboardProps {
  patientUuid: string;
}

const ImagingPatientDashboard: React.FC<ImagingPatientDashboardProps> = ({ patientUuid }) => (
  <OrdersPatientDashboard patientUuid={patientUuid} kind="imaging" />
);

export default ImagingPatientDashboard;
