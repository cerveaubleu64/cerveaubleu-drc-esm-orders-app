import { defineConfigSchema, getAsyncLifecycle, getSyncLifecycle } from '@openmrs/esm-framework';
import { configSchema } from './config-schema';
import {
  createDashboardLink,
  createPatientChartDashboardLink,
  radiologyDashboardMeta,
  proceduresDashboardMeta,
  radiologyImagingPatientDashboardMeta,
  proceduresPatientDashboardMeta,
} from './dashboard-link';

const moduleName = 'cerveaubleu-drc-esm-orders-app';
const options = { featureName: 'path-drc-orders', moduleName };

export const importTranslation = require.context('../translations', false, /.json$/, 'lazy');

// Run the illustration setup at module-parse time so we don't wait for
// startupApp() to fire. Even if the user lands on /login before the shell
// has finished booting our module, the listeners below will toggle the
// body class as soon as this bundle is parsed.
setupLoginIllustration();

export function startupApp() {
  defineConfigSchema(moduleName, configSchema);
  // No-op for the illustration here; setupLoginIllustration() already ran.
}

/**
 * Adds a fixed-position illustration to the right of the login form.
 *
 * The previous version relied on `body:has([class*="esm-login__login__container"])`
 * which had two intermittent failure modes:
 *  - timing: if /login rendered before startupApp() injected the <style>,
 *    nothing showed until the bundle finished loading;
 *  - browser support: `:has()` is unavailable on old Safari / iPad.
 *
 * This version toggles `body.path-drc-on-login` based on the URL (initial
 * load + every SPA navigation + back/forward). The CSS targets that class
 * directly, so it works without `:has()` and shows up the instant the URL
 * matches.
 */
function setupLoginIllustration() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  // Inject the <style> tag once.
  if (!document.getElementById('path-drc-login-illustration-style')) {
    const style = document.createElement('style');
    style.id = 'path-drc-login-illustration-style';
    style.textContent = `
      /* Show illustration only on /login* (desktop only, hide on tablet/phone) */
      @media (min-width: 64rem) {
        body.path-drc-on-login::before {
          content: '';
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: 50vw;
          background-image: url('/openmrs/spa/AfyaDME.png');
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          background-color: transparent;
          pointer-events: none;
          z-index: 0;
        }
        /* Constrain the login card to the left half so the layout is a clean 50/50. */
        body.path-drc-on-login [class*="esm-login__login__container"] {
          margin-right: 50vw;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const update = () => {
    // Only the credential form (/login or /login/login). Excludes the
    // location picker (/login/location) and confirm (/login/confirm).
    const onLogin = /\/login\/?$/.test(window.location.pathname);
    document.body?.classList.toggle('path-drc-on-login', onLogin);
  };

  // Apply now (DOM may already be ready).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', update, { once: true });
  } else {
    update();
  }

  // Catch back/forward.
  window.addEventListener('popstate', update);

  // Catch SPA navigation via History API (single-spa uses pushState/replaceState).
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    history[method] = function (this: History, ...args: Parameters<typeof original>) {
      const result = (original as (...a: typeof args) => ReturnType<typeof original>).apply(this, args);
      // Defer so the URL is committed before we read it.
      queueMicrotask(update);
      return result;
    } as typeof original;
  }
}

// Homepage dashboard links (left sidebar on /home)
// t('radiologyAndImaging', 'Radiology and Imaging')
export const radiologyDashboardLink = getSyncLifecycle(createDashboardLink(radiologyDashboardMeta), options);
// t('procedures', 'Procedures')
export const proceduresDashboardLink = getSyncLifecycle(createDashboardLink(proceduresDashboardMeta), options);

// Patient-chart dashboard: Radiology and Imaging (left-nav link + content)
// t('radiologyAndImaging', 'Radiology and Imaging')
export const radiologyImagingPatientDashboardLink = getSyncLifecycle(
  createPatientChartDashboardLink(radiologyImagingPatientDashboardMeta),
  options,
);
export const imagingPatientDashboard = getAsyncLifecycle(
  () => import('./patient-chart/imaging-patient-dashboard.component'),
  options,
);

// Patient-chart dashboard: Procedures (left-nav link + content)
// t('procedures', 'Procedures')
export const proceduresPatientDashboardLink = getSyncLifecycle(
  createPatientChartDashboardLink(proceduresPatientDashboardMeta),
  options,
);
export const proceduresPatientDashboard = getAsyncLifecycle(
  () => import('./patient-chart/procedures-patient-dashboard.component'),
  options,
);

// Dashboard destination pages
export const radiologyDashboardRoot = getAsyncLifecycle(
  () => import('./dashboards/radiology-dashboard-root.component'),
  options,
);
export const proceduresDashboardRoot = getAsyncLifecycle(
  () => import('./dashboards/procedures-dashboard-root.component'),
  options,
);

// Modals (confirmation dialogs)
export const pickConfirmModal = getAsyncLifecycle(() => import('./modals/pick-confirm.modal'), options);
export const rejectWithReasonModal = getAsyncLifecycle(() => import('./modals/reject-with-reason.modal'), options);
export const printReportModal = getAsyncLifecycle(() => import('./modals/print-report.modal'), options);

// Workspaces
export const enterResultsWorkspace = getAsyncLifecycle(
  () => import('./workspaces/enter-results.workspace'),
  options,
);

// Order-basket panels
export const imagingOrderPanel = getAsyncLifecycle(
  () => import('./panels/imaging-order-panel.component'),
  options,
);
export const procedureOrderPanel = getAsyncLifecycle(
  () => import('./panels/procedure-order-panel.component'),
  options,
);
export const medicalSupplyOrderPanel = getAsyncLifecycle(
  () => import('./panels/medical-supply-order-panel.component'),
  options,
);

// Workspaces
export const addImagingOrderWorkspace = getAsyncLifecycle(
  () => import('./workspaces/add-imaging-order.workspace'),
  options,
);
export const addProcedureOrderWorkspace = getAsyncLifecycle(
  () => import('./workspaces/add-procedure-order.workspace'),
  options,
);
export const addMedicalSupplyOrderWorkspace = getAsyncLifecycle(
  () => import('./workspaces/add-medical-supply-order.workspace'),
  options,
);
