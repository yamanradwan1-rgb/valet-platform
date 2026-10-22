import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { GuestInformationPage } from "../../features/guest-information/guest-information-page";

export default function GuestInformationRoute() {
  return (
    <ProtectedDashboardRoute accessRequirement="DASHBOARD">
      <GuestInformationPage />
    </ProtectedDashboardRoute>
  );
}
