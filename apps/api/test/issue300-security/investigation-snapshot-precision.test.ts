import { describe, expect, it, vi } from "vitest";
import type { PostgresTransaction } from "../../src/common/database/postgres";
import { captureManagementPaginationSnapshot } from "../../src/modules/management/management-pagination-snapshot";
import {
  readTimelineSources,
  timelineSourceSql,
} from "../../src/modules/management/audit-investigation/timeline/timeline-source-query";

const now = new Date("2026-10-18T12:00:00.000Z");
const cutoff = "2026-10-18T12:00:00.000900Z";
const pgSnapshot = "101:103:";
const scope = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  locationId: "22222222-2222-4222-8222-222222222222",
  membershipId: "33333333-3333-4333-8333-333333333333",
  role: "LOCATION_MANAGER" as const,
};

describe("Issue300 signed S0 capture and microsecond Timeline positions", () => {
  it("carries an exact PostgreSQL clock value separately from display milliseconds", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ now, cutoff, snapshot: pgSnapshot }],
    });
    const result = await captureManagementPaginationSnapshot({
      query,
    } as unknown as PostgresTransaction);
    expect(result).toEqual({ now, cutoff, snapshot: pgSnapshot });
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("WITH captured AS MATERIALIZED");
    expect(sql).toContain("clock_timestamp() AS now");
    expect(sql).toContain("pg_current_snapshot()");
    expect(sql).toContain("AS cutoff");
  });

  it("refuses inconsistent or missing precise clock instead of silently truncating", async () => {
    for (const bad of [
      "2026-10-18T12:00:00.001000Z",
      "2026-10-18T12:00:00.000Z",
      "",
    ]) {
      const tx = {
        query: vi.fn().mockResolvedValue({
          rows: [{ now, cutoff: bad, snapshot: pgSnapshot }],
        }),
      } as unknown as PostgresTransaction;
      await expect(captureManagementPaginationSnapshot(tx)).rejects.toThrow();
    }
  });

  it("passes a precise signed cutoff and last position as typed SQL parameters", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const last = {
      occurredAt: "2026-10-18T11:59:00.000500Z",
      sourceRank: 1,
      eventId: "44444444-4444-4444-8444-444444444444",
    };
    const result = await readTimelineSources(
      { query } as unknown as PostgresTransaction,
      scope,
      "55555555-5555-4555-8555-555555555555",
      2,
      undefined,
      { cutoff, database: pgSnapshot, last },
    );
    expect(result).toEqual([]);
    const args = query.mock.calls[0]?.[1];
    expect(args[7]).toBe(cutoff);
    expect(args[8]).toBe(last.occurredAt);
    expect(timelineSourceSql).toContain('AS "occurredAtCursor"');
    expect(timelineSourceSql).toContain("(occurred_at, rank, id) >");
  });
});
