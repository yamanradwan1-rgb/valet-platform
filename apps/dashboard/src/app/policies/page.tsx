import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { SettingsPage } from "../../features/administration/settings/settings-page";

export default async function PoliciesRoute({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  return (
    <ProtectedDashboardRoute accessRequirement="DASHBOARD">
      <SettingsPage serviceStatus={tab === "services"} />
    </ProtectedDashboardRoute>
  );
}
