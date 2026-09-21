import { HelpFoundation } from "../../components/foundation/help-foundation";
import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";

export default function HelpPage() {
  return (
    <ProtectedDashboardRoute accessRequirement="FOUNDATION_ENTRY">
      <HelpFoundation />
    </ProtectedDashboardRoute>
  );
}
