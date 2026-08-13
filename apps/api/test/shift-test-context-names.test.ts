import { describe, expect, it } from "vitest";

import { ShiftTestContext } from "./shift-test-context";

const safeRolePattern = /^[a-z_][a-z0-9_]{0,62}$/;
const safeDatabasePattern = /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/;

describe("Shift test database identities", () => {
  it("keeps deeply stacked context labels safe and collision-resistant", async () => {
    const label = "005e_006d_006e_mark_ready_guest_progression";
    const first = new ShiftTestContext(label);
    const second = new ShiftTestContext(label);
    try {
      expect(first.runtimeRole).toMatch(safeRolePattern);
      expect(first.databaseName).toMatch(safeDatabasePattern);
      expect(first.runtimeRole).not.toBe(second.runtimeRole);
      expect(first.databaseName).not.toBe(second.databaseName);
    } finally {
      await first.adminPool.end();
      await second.adminPool.end();
    }
  });
});
