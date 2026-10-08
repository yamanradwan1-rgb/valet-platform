import { describe, expect, it, vi } from "vitest";

import { reconcileEndedGuestPushRegistrations } from "../src/modules/guest-push/guest-push-maintenance-repository";

describe("Guest Push worker maintenance authority", () => {
  it("reconciles ended registrations only through the security-definer function", async () => {
    const query = vi.fn(async (sql: string, values: readonly unknown[]) => {
      void sql;
      void values;
      return {
        rowCount: 1,
        rows: [
          {
            suppressed_deliveries: 7,
            terminalized_registrations: 3,
          },
        ],
      };
    });

    await expect(
      reconcileEndedGuestPushRegistrations({ query } as never),
    ).resolves.toEqual({
      suppressedDeliveries: 7,
      terminalizedRegistrations: 3,
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toContain("public.guest_push_reconcile_ended_v1($1)");
    expect(values).toEqual([100]);
    expect(sql).not.toContain("guest_browser_sessions");
    expect(sql).not.toContain("valet_sessions");
    expect(sql).not.toContain("guest_push_registrations");
  });

  it("maps an empty resolver result to zero counters", async () => {
    const query = vi.fn(async (sql: string, values: readonly unknown[]) => {
      void sql;
      void values;
      return { rowCount: 0, rows: [] };
    });

    await expect(
      reconcileEndedGuestPushRegistrations({ query } as never),
    ).resolves.toEqual({
      suppressedDeliveries: 0,
      terminalizedRegistrations: 0,
    });
  });
});
