import { describe, expect, it, vi } from "vitest";

import type { PoolClient } from "pg";

import { StaffMfaTestFixture } from "./staff-mfa-test-fixture";

describe("Staff MFA PostgreSQL race barrier", () => {
  it("requires two genuine blocking edges behind the exact held backend PID", async () => {
    const held = {
      query: vi.fn().mockResolvedValue({ rows: [{ pid: 1201 }] }),
    } as unknown as PoolClient;
    const query = vi.fn().mockResolvedValue({
      rows: [{ pid: 1202 }, { pid: 1203 }],
    });
    const fixture = new StaffMfaTestFixture();
    Object.defineProperty(fixture, "adminPool", {
      configurable: true,
      value: { query },
    });

    await fixture.waitForBlockedMfaQueries(held, 2);

    expect(held.query).toHaveBeenCalledWith(
      "SELECT pg_backend_pid()::integer AS pid",
    );
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain(
      "pg_blocking_pids(activity.pid)",
    );
    expect(query.mock.calls[0]?.[0]).not.toContain("wait_event_type");
    expect(query.mock.calls[0]?.[0]).not.toContain("activity.query");
    expect(query.mock.calls[0]?.[1]).toEqual([1201, null]);
  });

  it("fails closed if the held PostgreSQL backend cannot be established", async () => {
    const held = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as PoolClient;
    const fixture = new StaffMfaTestFixture();
    await expect(fixture.waitForBlockedMfaQueries(held, 2)).rejects.toThrow(
      /backend PID is unavailable/,
    );
  });
});
