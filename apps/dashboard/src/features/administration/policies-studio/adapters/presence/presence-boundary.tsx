"use client";

import type { ReactNode } from "react";
import { useProtectedDashboard } from "../../../../../components/foundation/protected-dashboard-context";
import {
  presenceStudioAccess,
  presenceStudioScopeKey,
  type PresenceStudioAccess,
} from "./presence-scope";
import { usePoliciesStudioPresence } from "./use-policies-studio-presence";

type Adapter = ReturnType<typeof usePoliciesStudioPresence>;

/** Keyed child retires mutation and geolocation lifetimes on identity/scope changes. */
export function PoliciesStudioPresenceBoundary(props: {
  readonly company?: boolean;
  readonly children: (adapter: Adapter) => ReactNode;
  readonly unavailable: (reason: Exclude<PresenceStudioAccess, "REQUESTABLE">) => ReactNode;
}) {
  const dashboard = useProtectedDashboard();
  const company = props.company ?? false;
  const access = presenceStudioAccess(dashboard.selectedScope, company);
  if (access !== "REQUESTABLE") return <>{props.unavailable(access)}</>;
  return (
    <ActivePresence
      key={presenceStudioScopeKey(dashboard, company)}
      company={company}
      render={props.children}
    />
  );
}

function ActivePresence(props: {
  readonly company: boolean;
  readonly render: (adapter: Adapter) => ReactNode;
}) {
  const adapter = usePoliciesStudioPresence({ company: props.company });
  return <>{props.render(adapter)}</>;
}
