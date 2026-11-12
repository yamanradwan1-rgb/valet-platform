import { redirect, RedirectType } from "next/navigation";
import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { ManagementAlertsPrototypeControl } from "@issue432/management-alerts-prototype-control";
import { resolveAlertsPrototypeRoute } from "../../features/management-alerts/prototype/prototype-route-gate";
import { PoliciesStudioPage } from "../../features/administration/policies-studio/policies-studio-page";

export default async function PoliciesRoute({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly tab?: string | string[];
    readonly prototype?: string | string[];
    readonly variant?: string | string[];
  }>;
}) {
  const { tab, prototype, variant } = await searchParams;
  if (tab === "services") redirect("/policies", RedirectType.replace);
  const prototypeRoute = resolveAlertsPrototypeRoute(
    process.env.NODE_ENV,
    prototype,
    variant,
  );
  return (
    <ProtectedDashboardRoute
      accessRequirement="DASHBOARD"
      alertsControlOverride={
        prototypeRoute.enabled ? (
          <ManagementAlertsPrototypeControl
            key={prototypeRoute.variant}
            variant={prototypeRoute.variant}
          />
        ) : undefined
      }
    >
      <PoliciesStudioPage />
    </ProtectedDashboardRoute>
  );
}
