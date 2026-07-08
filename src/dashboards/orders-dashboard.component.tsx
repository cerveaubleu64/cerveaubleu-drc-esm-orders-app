import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tabs, TabList, Tab, TabPanels, TabPanel } from '@carbon/react';
import { Add } from '@carbon/react/icons';
import { UserXrayIcon, MotherIcon, useConfig, navigate } from '@openmrs/esm-framework';
import { type Config } from '../config-schema';
import { useOrdersByType } from '../api/orders-list.resource';
import { useConceptSetMembers } from '../api/concepts.resource';
import {
  type TabConfig,
  type TabKey,
  orderMatchesTab,
  withinDateRange,
  RADIOLOGY_TABS,
  PROCEDURE_TABS,
} from './dashboard-helpers';
import DashboardHeader from './dashboard-header.component';
import MetricCard from './metric-card.component';
import TabPanelContent from './tab-panel.component';

type Kind = 'imaging' | 'procedure';

interface MetricDef {
  labelKey: string;
  labelDefault: string;
  computeFor: TabKey[]; // union of tabs whose count contributes
}

interface OrdersDashboardProps {
  kind: Kind;
  titleKey: string;
  titleDefault: string;
  Icon: React.ComponentType<{ size?: number; fill?: string }>;
  rightAction?: React.ReactNode;
  tabs: TabConfig[];
  metrics: [MetricDef, MetricDef, MetricDef];
  /** Lowercase noun used in detail labels ("imaging" / "procedure"). */
  kindNoun: string;
  /** Noun used in action labels ("imaging request" / "procedure"). */
  requestNoun: string;
}

const today = (): Date => new Date();

const OrdersDashboard: React.FC<OrdersDashboardProps> = ({
  kind,
  titleKey,
  titleDefault,
  Icon,
  rightAction,
  tabs,
  metrics,
  kindNoun,
  requestNoun,
}) => {
  const { t } = useTranslation();
  const config = useConfig<Config>();
  const orderTypeUuid = config[kind]?.orderTypeUuid;
  const conceptSetUuid = config[kind]?.conceptSetUuid;
  const { orders, isLoading, error, mutate } = useOrdersByType(orderTypeUuid);
  const { memberUuids } = useConceptSetMembers(conceptSetUuid);
  const memberSet = useMemo(() => new Set(memberUuids), [memberUuids]);

  const [dateRange, setDateRange] = useState<[Date, Date]>([today(), today()]);

  // Imaging and procedure orders share the same OrderType, so scope each
  // dashboard to the concepts that belong to its own concept set. When no
  // concept set is configured, fall back to showing every order of the type.
  const scopedOrders = useMemo(() => {
    if (!conceptSetUuid) return orders;
    return orders.filter((o) => !!o.concept?.uuid && memberSet.has(o.concept.uuid));
  }, [orders, conceptSetUuid, memberSet]);

  // Filter orders by date range (drives both metric counts and per-tab tables)
  const ordersInRange = useMemo(
    () => scopedOrders.filter((o) => withinDateRange(o, dateRange[0], dateRange[1])),
    [scopedOrders, dateRange],
  );

  // Per-tab order list
  const ordersByTab = useMemo(() => {
    const map = {} as Record<TabKey, typeof ordersInRange>;
    for (const tab of tabs) {
      map[tab.key] = ordersInRange.filter((o) => orderMatchesTab(o, tab.key));
    }
    return map;
  }, [ordersInRange, tabs]);

  const metricCounts = metrics.map((m) =>
    m.computeFor.reduce((sum, k) => sum + (ordersByTab[k]?.length ?? 0), 0),
  );

  return (
    <div>
      {/* Header bar with icon + Home + title (+ optional right action) */}
      <DashboardHeader title={t(titleKey, titleDefault)} Icon={Icon} rightSlot={rightAction} />

      <div style={{ padding: '1rem' }}>
        {/* 3 metric cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}>
          {metrics.map((m, i) => (
            <MetricCard key={m.labelKey} title={t(m.labelKey, m.labelDefault)} count={metricCounts[i]} />
          ))}
        </div>

        {/* Tabs */}
        <Tabs>
          <TabList aria-label={kind} contained>
            {tabs.map((tab) => (
              <Tab key={tab.key}>
                {t(tab.labelKey, tab.labelDefault)} ({ordersByTab[tab.key]?.length ?? 0})
              </Tab>
            ))}
          </TabList>
          <TabPanels>
            {tabs.map((tab) => (
              <TabPanel key={tab.key} style={{ padding: 0 }}>
                <TabPanelContent
                  sectionTitle={t(tab.sectionKey, tab.sectionDefault)}
                  emptyMessage={t(tab.emptyKey, tab.emptyDefault)}
                  orders={ordersByTab[tab.key]}
                  isLoading={isLoading}
                  error={error}
                  onRefresh={() => mutate()}
                  dateRange={dateRange}
                  onDateRangeChange={setDateRange}
                  kind={kind}
                  tabKey={tab.key}
                  kindNoun={kindNoun}
                  requestNoun={requestNoun}
                />
              </TabPanel>
            ))}
          </TabPanels>
        </Tabs>
      </div>
    </div>
  );
};

export const RadiologyDashboard: React.FC = () => {
  const { t } = useTranslation();
  return (
    <OrdersDashboard
      kind="imaging"
      titleKey="radiologyAndImaging"
      titleDefault="Radiology and Imaging"
      Icon={UserXrayIcon}
      tabs={RADIOLOGY_TABS}
      kindNoun={t('imaging', 'imaging')}
      requestNoun={t('imagingRequest', 'imaging request')}
      metrics={[
        { labelKey: 'imagingOrders', labelDefault: 'Imaging orders', computeFor: ['active'] },
        { labelKey: 'workList', labelDefault: 'Worklist', computeFor: ['worklist'] },
        { labelKey: 'results', labelDefault: 'Results', computeFor: ['approved'] },
      ]}
    />
  );
};

export const ProceduresDashboard: React.FC = () => {
  const { t } = useTranslation();
  const addButton = (
    <Button
      kind="primary"
      renderIcon={(props: React.ComponentProps<typeof Add>) => <Add size={20} {...props} />}
      onClick={() => navigate({ to: '${openmrsSpaBase}/search' })}>
      {t('addProcedureOrderLong', 'Add Procedure Order')}
    </Button>
  );
  return (
    <OrdersDashboard
      kind="procedure"
      titleKey="procedures"
      titleDefault="Procedures"
      Icon={MotherIcon}
      rightAction={addButton}
      tabs={PROCEDURE_TABS}
      kindNoun={t('procedure', 'procedure')}
      requestNoun={t('procedureRequest', 'procedure')}
      metrics={[
        { labelKey: 'awaitingProcedure', labelDefault: 'Awaiting Procedure', computeFor: ['active'] },
        { labelKey: 'ongoingProcedures', labelDefault: 'Ongoing Procedures', computeFor: ['worklist'] },
        { labelKey: 'completedProcedures', labelDefault: 'Completed Procedures', computeFor: ['completed'] },
      ]}
    />
  );
};

export default OrdersDashboard;
