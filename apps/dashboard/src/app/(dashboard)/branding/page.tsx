"use client";

import { BrandingView } from "../../../features/branding/branding-view";

/**
 * Branding route (D4-004). Real typed location branding against the backend
 * contracts reverified in
 * apps/api/src/modules/dashboard/branding.controller.ts, replacing the
 * former foundation placeholder.
 */
export default function Page() {
  return <BrandingView />;
}
