import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { queryRetrievalStageAlertCases } from "../src/modules/dashboard/management-alert-sources/retrieval-stage-alert-reader";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";
import {
  phaseReaderInput,
  restoreTrustedPhaseTestCutover,
  seedPhaseStage,
} from "./issue414-retrieval-phase-source-fixture";

// A separate Vitest file releases the source suite's two PostgreSQL pools
// before creating this independent pagination database and its two pools.
const db = new DashboardOverviewTestContext("414-p2-stage-pagination");
beforeAll(() => db.setup(), 120_000);
afterAll(async () => {
  restoreTrustedPhaseTestCutover();
  await db.teardown();
}, 120_000);

describe("Issue #414 ALT-04 isolated pagination source proof", () => {
  it("proves globally newest 21 eligible after 21 newer SLA-suppressed same-ms sources", async () => {
    // New file-level fixture avoids contamination by earlier stage-source cases.
    const input = await phaseReaderInput(db);
    const timestamps = await db.adminPool.query<{
      newer: Date;
      older: Date;
    }>(
      `SELECT (clock_timestamp()-interval '80 seconds')::timestamptz(3) AS newer,
              (clock_timestamp()-interval '120 seconds')::timestamptz(3) AS older`,
    );
    const { newer, older } = timestamps.rows[0]!;
    // A naïve candidate LIMIT 21 would lose every eligible Task here.
    const suppressed: string[] = [];
    for (let count = 0; count < 21; count += 1) {
      suppressed.push(
        (await seedPhaseStage(db, "ACCEPTED", newer, 30)).taskId,
      );
    }
    const eligible: string[] = [];
    for (let count = 0; count < 23; count += 1) {
      const source = await seedPhaseStage(db, "ACCEPTED", older);
      eligible.push(source.taskId);
    }
    const items = await inPostgresTransaction(
      db.runtimePool,
      (tx) => queryRetrievalStageAlertCases(tx, input),
    );
    expect(items).toHaveLength(21);
    const expected = eligible
      .sort((left, right) => (left < right ? 1 : -1))
      .slice(0, 21);
    expect(items.map((item) => item.sourceId)).toEqual(expected);
    expect(
      items.every((item) => item.occurredAt === older.toISOString()),
    ).toBe(true);
    expect(items.some((item) => suppressed.includes(item.sourceId))).toBe(
      false,
    );
  }, 60_000);
});
