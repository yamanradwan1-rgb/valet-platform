"use client";

import type { ReactNode } from "react";

import type { DashboardRouteAccessRequirement } from "../../lib/scope/dashboard-commercial-access";
import { ManagementFoundationApp } from "./management-foundation-app";

export function ProtectedDashboardRoute({
  children,
  accessRequirement = "DASHBOARD",
}: {
  readonly children: ReactNode;
  readonly accessRequirement?: DashboardRouteAccessRequirement;
}) {
  return (
    <ManagementFoundationApp accessRequirement={accessRequirement}>
      {children}
    </ManagementFoundationApp>
  );
}
