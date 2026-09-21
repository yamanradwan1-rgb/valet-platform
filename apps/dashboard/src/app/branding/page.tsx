import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { BrandingPage } from "../../features/administration/branding/branding-page";

export default function BrandingRoute() {
  return <ProtectedDashboardRoute accessRequirement="BRANDING"><BrandingPage /></ProtectedDashboardRoute>;
}
