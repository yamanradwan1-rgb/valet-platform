import { createRoot } from 'react-dom/client';
import { DashboardLocaleProvider, useDashboardLocale } from '@dashboard/lib/i18n/locale-provider';
import { DashboardThemeProvider } from '@dashboard/lib/theme/theme-provider';
import { DashboardShell } from '@dashboard/components/shell/dashboard-shell';
import { ProtectedDashboardContextProvider } from '@dashboard/components/foundation/protected-dashboard-context';
import { HeaderLocaleControl, HeaderThemeControl } from '@dashboard/components/foundation/header-preferences';
import { dashboardShellLabels } from '@dashboard/components/foundation/dashboard-shell-labels';
import { dashboardNavigationRegistrations, candidateNavigationRegistrations } from '@dashboard/lib/navigation';
import { TasksPage } from '@dashboard/features/operations/tasks/tasks-page';
import '@dashboard/app/globals.css';
import { dashboardContext, location, organization } from './task-fixtures';

function Preview() {
  const { locale, t } = useDashboardLocale();
  const navigationItems = candidateNavigationRegistrations(dashboardNavigationRegistrations, {
    role: 'LOCATION_MANAGER', organizationId: organization.organizationId, locationId: location.locationId,
  }).map((entry) => ({ ...entry, label: entry.labels[locale] }));
  return (
    <ProtectedDashboardContextProvider value={dashboardContext}>
      <DashboardShell
        currentPath="/tasks" labels={dashboardShellLabels(t)} navigationItems={navigationItems}
        onLocationSelect={() => undefined} onOrganizationSelect={() => undefined}
        selectedLocation={{ id: location.locationId, label: location.name }}
        selectedOrganization={{ id: organization.organizationId, label: organization.name }}
        localeControl={<HeaderLocaleControl />} themeControl={<HeaderThemeControl />}
      >
        <TasksPage />
      </DashboardShell>
    </ProtectedDashboardContextProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <DashboardLocaleProvider><DashboardThemeProvider><Preview /></DashboardThemeProvider></DashboardLocaleProvider>,
);
