import React from 'react';
import { Tile } from '@carbon/react';

interface MetricCardProps {
  title: string;
  count: number | string;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, count }) => (
  <Tile style={{ padding: '1rem', height: '100%' }}>
    <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#161616' }}>{title}</h4>
    <p style={{ margin: '0.5rem 0 0 0', fontSize: '2rem', fontWeight: 300, color: '#161616' }}>{count}</p>
  </Tile>
);

export default MetricCard;
