import { useEffect, useRef } from "react";
import type { EmployeeOperationalSession } from "@valet/employee-client";

import type { ProductionShellState } from "./production-shell-controller";

export function useNativeTasksRouteRevalidation(
  operations: EmployeeOperationalSession | undefined,
  shell: ProductionShellState,
  identityGeneration: number,
): void {
  const destination = shell.kind === "active" ? shell.destination : null;
  const scopeKey =
    shell.kind === "active"
      ? [
          identityGeneration,
          shell.scope.organizationId,
          shell.scope.membershipId,
          shell.scope.locationId,
          shell.scope.shiftId,
          shell.scope.role,
        ].join(":")
      : null;
  const previous = useRef<{ destination: string; scopeKey: string } | null>(null);

  // First hydration and same-authority foreground recovery already own a
  // context-first read. Only a genuine warm route transition needs invalidation.
  useEffect(() => {
    if (destination === null || scopeKey === null) return;
    const last = previous.current;
    previous.current = { destination, scopeKey };
    if (
      destination === "tasks" &&
      last?.scopeKey === scopeKey &&
      last.destination !== "tasks"
    ) {
      void operations?.refreshQueueForNavigation();
    }
  }, [operations, destination, scopeKey]);
}
