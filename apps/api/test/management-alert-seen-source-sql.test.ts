import { describe, expect, it } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import { readCommittedSeenSourceTime } from "../src/modules/dashboard/management-alert-seen/management-alert-seen-source";

describe("Issue #414 ALT-15 Seen matches canonical staff locationCount SQL", () => {
  it("requires first digit 1–9 with no leading zero, exactly like the source reader", async () => {
    let querySql = "";
    const tx = {
      query: async (sql: string) => {
        querySql = sql;
        return { rowCount: 1, rows: [{ occurredAt: new Date("2026-11-04T00:00:00Z") }] };
      },
    } as unknown as PostgresTransaction;
    await readCommittedSeenSourceTime(tx, {
      organizationId: "11111111-1111-4111-8111-111111111111",
      locationId: "22222222-2222-4222-8222-222222222222",
      category: "ALT-15",
      sourceId: "33333333-3333-4333-8333-333333333333",
      episodeId: "44444444-4444-4444-8444-444444444444",
    });
    expect(querySql).toContain("(audit.metadata_json->>'locationCount') ~ '^[1-9][0-9]*$'");
    expect(querySql).not.toContain("length(audit.metadata_json->>'locationCount')");
    expect(querySql).not.toContain("::numeric");
    expect("1").toMatch(/^[1-9][0-9]*$/);
    expect("12").toMatch(/^[1-9][0-9]*$/);
    expect("0001").not.toMatch(/^[1-9][0-9]*$/);
  });
});
