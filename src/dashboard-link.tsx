import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { DashboardExtension, type DashboardExtensionProps, type IconId } from '@openmrs/esm-framework';

type DashboardLinkConfig = Omit<DashboardExtensionProps, 'icon'> & { icon?: IconId };

export const createDashboardLink =
  (config: DashboardLinkConfig) =>
  () =>
    (
      <BrowserRouter>
        <DashboardExtension
          path={config.path}
          title={config.title}
          basePath={config.basePath}
          icon={config.icon}
        />
      </BrowserRouter>
    );

export const radiologyDashboardMeta = {
  path: 'radiology-and-imaging',
  slot: 'radiology-and-imaging-dashboard-slot',
  title: 'radiologyAndImaging',
  basePath: `${window.spaBase}/home`,
} as const;

export const proceduresDashboardMeta = {
  path: 'procedures',
  slot: 'procedures-dashboard-slot',
  title: 'procedures',
  basePath: `${window.spaBase}/home`,
} as const;

// Patient-chart dashboard link. Unlike the home links, the basePath is the
// patient's chart URL, which the patient chart provides to the extension at
// render time — so we read it from props instead of hardcoding it.
export const radiologyImagingPatientDashboardMeta = {
  path: 'radiology-imaging',
  slot: 'patient-chart-radiology-imaging-slot',
  // The patient-chart nav translates this under its own namespace where our key
  // isn't defined, so it would render the raw key. Pass the display text directly
  // (t() falls back to the string itself when no translation key matches).
  title: 'Radiologie et Imagérie',
  icon: 'omrs-icon-user-xray' as IconId,
} as const;

export const createPatientChartDashboardLink =
  (config: { path: string; title: string; icon?: IconId }) =>
  ({ basePath }: { basePath: string }) =>
    (
      <BrowserRouter>
        <DashboardExtension path={config.path} title={config.title} basePath={basePath} icon={config.icon} />
      </BrowserRouter>
    );
