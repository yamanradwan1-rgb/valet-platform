"use client";

import { useOperationsContext } from "../use-operations-context";
import { ResourceInspectorLive } from "./resource-inspector-live";

/** Exact Option 3 interior replaces both former Keys & Spots page-level tabs. */
export function KeysPage() {
  const { scopeKey } = useOperationsContext();
  return (
    <div data-testid="md03-page">
      <ResourceInspectorLive key={scopeKey} />
    </div>
  );
}
