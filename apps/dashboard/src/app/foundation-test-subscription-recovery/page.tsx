import { notFound } from "next/navigation";

import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { SubscriptionRecoveryProbe } from "./subscription-recovery-probe";

export default function SubscriptionRecoveryFixturePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <ProtectedDashboardRoute accessRequirement="SUBSCRIPTION_READ">
      <SubscriptionRecoveryProbe />
    </ProtectedDashboardRoute>
  );
}
