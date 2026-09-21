"use client";

import type { ReactNode } from "react";

import type { DashboardCommercialRequirement } from "../../lib/scope/dashboard-commercial-access";
import { ManagementFoundationApp } from "./management-foundation-app";

export function ProtectedDashboardRoute({
  children,
  commercialRequirement = "DASHBOARD",
}: {
  readonly children: ReactNode;
  readonly commercialRequirement?: DashboardCommercialRequirement;
}) {
  return (
    <ManagementFoundationApp commercialRequirement={commercialRequirement}>
      {children}
    </ManagementFoundationApp>
  );
}
