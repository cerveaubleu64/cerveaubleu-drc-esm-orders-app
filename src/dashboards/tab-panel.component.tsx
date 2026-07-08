import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DatePicker, DatePickerInput, Search } from '@carbon/react';
import { Renew } from '@carbon/react/icons';
import { type OrderSummary } from '../api/orders-list.resource';
import { type TabKey } from './dashboard-helpers';
import OrdersByPatient from './orders-by-patient.component';

interface TabPanelProps {
  sectionTitle: string;
  emptyMessage: string;
  orders: OrderSummary[];
  isLoading: boolean;
  error: unknown;
  onRefresh: () => void;
  dateRange: [Date, Date];
  onDateRangeChange: (range: [Date, Date]) => void;
  /** Literal kind for behavior switching (file upload, pending review). */
  kind: 'imaging' | 'procedure' | 'medicalSupply';
  /** Which tab this panel renders — drives the Action column on approved/completed. */
  tabKey: TabKey;
  /** Localized noun used in the order detail rows ("imaging" / "procedure"). */
  kindNoun: string;
  /** Localized noun used in action labels ("imaging request" / "procedure"). */
  requestNoun: string;
}

const TabPanelContent: React.FC<TabPanelProps> = ({
  sectionTitle,
  emptyMessage,
  orders,
  isLoading,
  error,
  onRefresh,
  dateRange,
  onDateRangeChange,
  kind,
  tabKey,
  kindNoun,
  requestNoun,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      [o.patient?.display, o.concept?.display, o.orderNumber, o.orderer?.display]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [orders, searchQuery]);

  return (
    <div style={{ backgroundColor: '#f4f4f4', padding: '1.5rem' }}>
      <div style={{ backgroundColor: '#fff', padding: '1rem' }}>
        {/* Section header with green underline + Refresh */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: '1rem',
          }}>
          <h3
            style={{
              margin: 0,
              fontSize: '1.125rem',
              fontWeight: 400,
              color: '#161616',
              paddingBottom: '0.25rem',
              borderBottom: '0.25rem solid #198038',
              display: 'inline-block',
            }}>
            {sectionTitle}
          </h3>
          <button
            type="button"
            onClick={onRefresh}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              background: 'none',
              border: 'none',
              color: '#0f62fe',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}>
            {t('refresh', 'Refresh')}
            <Renew size={16} />
          </button>
        </div>

        {/* Filter row: search + date range */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            marginBottom: '1rem',
            flexWrap: 'wrap',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem' }}>{t('dateRange', 'Date range')}:</span>
            <DatePicker
              datePickerType="range"
              value={dateRange}
              onChange={(dates: Date[]) => {
                if (dates.length === 2) onDateRangeChange([dates[0], dates[1]]);
              }}
              dateFormat="d/m/Y">
              <DatePickerInput id="from" placeholder="dd/mm/yyyy" labelText="" />
              <DatePickerInput id="to" placeholder="dd/mm/yyyy" labelText="" />
            </DatePicker>
          </div>
          <div style={{ flex: '0 1 320px' }}>
            <Search
              size="md"
              labelText={t('searchThisList', 'Search this list')}
              placeholder={t('searchThisList', 'Search this list')}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Body: table or empty state */}
        {!isLoading && !error && filteredOrders.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              color: '#525252',
            }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📋</div>
            <p style={{ fontWeight: 600 }}>{emptyMessage}</p>
          </div>
        ) : (
          <OrdersByPatient
            orders={filteredOrders}
            isLoading={isLoading}
            error={error}
            kind={kind}
            tabKey={tabKey}
            kindNoun={kindNoun}
            requestNoun={requestNoun}
            onChanged={onRefresh}
          />
        )}
      </div>
    </div>
  );
};

export default TabPanelContent;
