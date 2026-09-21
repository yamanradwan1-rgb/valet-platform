import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { SubscriptionPage } from "../../features/administration/commercial/subscription-page";

export default function BillingSubscriptionRoute() {
  return <ProtectedDashboardRoute accessRequirement="SUBSCRIPTION_READ"><SubscriptionPage /></ProtectedDashboardRoute>;
}
