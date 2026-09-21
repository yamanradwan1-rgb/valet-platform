import { ProtectedDashboardRoute } from "../components/foundation/protected-dashboard-route";
import { WorkspaceFoundation } from "../components/foundation/workspace-foundation";

export default function Home() {
  return (
    <ProtectedDashboardRoute accessRequirement="FOUNDATION_ENTRY">
      <WorkspaceFoundation />
    </ProtectedDashboardRoute>
  );
}
