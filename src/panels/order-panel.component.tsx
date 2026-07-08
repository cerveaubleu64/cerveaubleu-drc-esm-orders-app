import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tag } from '@carbon/react';
import { Add, TrashCan } from '@carbon/react/icons';
import { launchWorkspace2 } from '@openmrs/esm-framework';
import {
  GROUPING_BY_KIND,
  registerGrouping,
  removeBasketItem,
  useBasketItems,
  type PathDrcBasketItem,
} from '../order-basket';

type OrderKind = 'imaging' | 'procedure' | 'medicalSupply';

interface OrderPanelProps {
  patientUuid?: string;
  kind: OrderKind;
  titleKey: string;
  titleDefault: string;
  addLabelKey: string;
  addLabelDefault: string;
  workspaceName: string;
  TitleIcon?: React.ComponentType<{ size?: number; fill?: string }>;
  /** Hex color used for the left-edge stripe and the icon fill. */
  accentColor: string;
}

function patientUuidFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const m = window.location.pathname.match(/\/patient\/([0-9a-f-]{36})\b/i);
  return m?.[1];
}

const OrderPanel: React.FC<OrderPanelProps> = ({
  patientUuid: patientUuidProp,
  kind,
  titleKey,
  titleDefault,
  addLabelKey,
  addLabelDefault,
  workspaceName,
  TitleIcon,
  accentColor,
}) => {
  const { t } = useTranslation();
  const patientUuid = patientUuidProp ?? patientUuidFromUrl();
  const grouping = GROUPING_BY_KIND[kind];
  const items = useBasketItems(patientUuid, grouping);

  // Make sure the chart's "Sign and close" knows how to post our orders even
  // before the user adds the first item.
  useEffect(() => {
    registerGrouping(grouping);
  }, [grouping]);

  return (
    <div
      style={{
        position: 'relative',
        borderLeft: `0.25rem solid ${accentColor}`,
        backgroundColor: '#fff',
      }}>
      <div
        style={{
          backgroundColor: '#f4f4f4',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.5rem 0.75rem',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {TitleIcon ? <TitleIcon size={20} fill={accentColor} /> : null}
          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#525252' }}>
            {t(titleKey, titleDefault)} ({items.length})
          </h4>
        </div>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={(props: React.ComponentProps<typeof Add>) => <Add size={16} {...props} />}
          iconDescription={t(addLabelKey, addLabelDefault)}
          onClick={() => launchWorkspace2(workspaceName, { patientUuid, kind })}>
          {t(addLabelKey, addLabelDefault)}
        </Button>
      </div>

      {items.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((item: PathDrcBasketItem) => (
            <li
              key={item.__id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                borderBottom: '1px solid #f4f4f4',
              }}>
              <div>
                <Tag type="green" size="sm">
                  {t('newOrderTag', 'New')}
                </Tag>
                <div style={{ fontWeight: 600, marginTop: '0.25rem' }}>{item.display}</div>
                {item.instructions ? (
                  <div style={{ fontSize: '0.75rem', color: '#6f6f6f' }}>{item.instructions}</div>
                ) : null}
              </div>
              <Button
                kind="ghost"
                size="sm"
                hasIconOnly
                iconDescription={t('remove', 'Remove')}
                renderIcon={(props: React.ComponentProps<typeof TrashCan>) => <TrashCan size={16} {...props} />}
                onClick={() => patientUuid && removeBasketItem(patientUuid, grouping, item.__id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default OrderPanel;
