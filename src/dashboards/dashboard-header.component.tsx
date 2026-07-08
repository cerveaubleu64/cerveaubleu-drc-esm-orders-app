import React from 'react';
import { useTranslation } from 'react-i18next';

interface DashboardHeaderProps {
  title: string;
  Icon: React.ComponentType<{ size?: number; fill?: string }>;
  rightSlot?: React.ReactNode;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ title, Icon, rightSlot }) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1rem 1.5rem',
        borderBottom: '1px solid #e0e0e0',
        backgroundColor: '#fff',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '3rem',
            height: '3rem',
            color: '#005d5d',
          }}>
          <Icon size={48} fill="#005d5d" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.75rem', color: '#525252' }}>{t('home', 'Home')}</span>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 400, color: '#161616' }}>{title}</h1>
        </div>
      </div>
      {rightSlot ? <div>{rightSlot}</div> : null}
    </div>
  );
};

export default DashboardHeader;
