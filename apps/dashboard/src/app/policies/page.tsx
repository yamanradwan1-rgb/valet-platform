import { redirect, RedirectType } from "next/navigation";
import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { PoliciesStudioPage } from "../../features/administration/policies-studio/policies-studio-page";

export default async function PoliciesRoute({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  if (tab === "services") redirect("/policies", RedirectType.replace);
  return (
    <ProtectedDashboardRoute accessRequirement="DASHBOARD">
      <PoliciesStudioPage />
    </ProtectedDashboardRoute>
  );
}
