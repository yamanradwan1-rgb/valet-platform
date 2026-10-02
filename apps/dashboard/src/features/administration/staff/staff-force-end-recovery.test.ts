import { describe, expect, it } from "vitest";
import type { ProtectedDashboardContextValue } from "../../../components/foundation/protected-dashboard-context";
import {
  forceEndRecoveryScope,
  rememberForceEndRecovery,
  readForceEndRecovery,
  clearForceEndRecovery,
} from "./staff-force-end-recovery";
// Only the epoch fields and authority projection participate in this boundary.
const dashboard = {
  identityGeneration: 1,
  sessionGeneration: 2,
  selectionRevision: 3,
  selectedScope: {
    authority: "COMPANY_ADMIN_SUBSCRIPTION",
    organization: { organizationId: "a" },
  },
} as unknown as ProtectedDashboardContextValue;
describe("volatile rejected-POST auth recovery", () => {
  it("is only available to the exact reconciled epoch and is consumed once", () => {
    const value = {
      scope: forceEndRecoveryScope(dashboard),
      sessionGeneration: 2,
      shiftId: "shift",
      reason: "reason",
      operationId: "operation",
    };
    rememberForceEndRecovery(value);
    expect(readForceEndRecovery(dashboard)).toBe(value);
    clearForceEndRecovery(value);
    expect(readForceEndRecovery(dashboard)).toBeNull();
  });
  it.each([
    "identityGeneration",
    "sessionGeneration",
    "selectionRevision",
  ] as const)("discards changed %s, including A→B→A", (field) => {
    rememberForceEndRecovery({
      scope: forceEndRecoveryScope(dashboard),
      sessionGeneration: 2,
      shiftId: "shift",
      reason: "reason",
      operationId: "operation",
    });
    expect(
      readForceEndRecovery({ ...dashboard, [field]: dashboard[field] + 1 }),
    ).toBeNull();
    expect(readForceEndRecovery(dashboard)).toBeNull();
  });
});
