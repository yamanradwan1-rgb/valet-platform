"use client";

import { SubscriptionView } from "../../../features/subscription/subscription-view";

/**
 * Subscription route (D4-004). Strictly read-only subscription facts from
 * apps/api/src/modules/dashboard/subscription.controller.ts (GET is the only
 * route the backend exposes), replacing the former foundation placeholder.
 */
export default function Page() {
  return <SubscriptionView />;
}
