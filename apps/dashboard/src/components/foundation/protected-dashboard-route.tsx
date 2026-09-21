"use client";

import type { ReactNode } from "react";

import { ManagementFoundationApp } from "./management-foundation-app";

export function ProtectedDashboardRoute({
  children,
}: {
  readonly children: ReactNode;
}) {
  return <ManagementFoundationApp>{children}</ManagementFoundationApp>;
}
