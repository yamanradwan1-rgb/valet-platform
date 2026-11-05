import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import {
  findRetrievalStageAlertCaseById,
  queryRetrievalStageAlertCases,
} from "../src/modules/dashboard/management-alert-sources/retrieval-stage-alert-reader";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";
import {
  phaseReaderInput,
  restoreTrustedPhaseTestCutover,
  seedPhaseStage,
} from "./issue414-retrieval-phase-source-fixture";

const db = new DashboardOverviewTestContext("414-p2-stage-access");
beforeAll(() => db.setup(), 120_000);
afterAll(async () => {
  restoreTrustedPhaseTestCutover();
  await db.teardown();
}, 120_000);

describe("Issue #414 ALT-04 current source authorization", () => {
  it("denies revoked exact LM grant before source selection", async () => {
    const input = await phaseReaderInput(db);
    await seedPhaseStage(db, "ACCEPTED");
    const fixture = await db.managerFixture();
    try {
      await db.adminPool.query(
        "DELETE FROM membership_location_access WHERE membership_id=$1",
        [input.scope.membershipId],
      );
      await expect(
        inPostgresTransaction(db.runtimePool, (tx) =>
          queryRetrievalStageAlertCases(tx, input),
        ),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    } finally {
      await db.grantAccess(fixture, input.scope.membershipId);
    }
  });

  it("denies real ungranted LM and unsupported staff roles before selecting Task source", async () => {
    const input = await phaseReaderInput(db);
    await seedPhaseStage(db, "ACCEPTED");
    const fixture = await db.managerFixture();
    for (const role of [
      "LOCATION_MANAGER",
      "VALET_EMPLOYEE",
      "VALET_SUPERVISOR",
    ] as const) {
      const actor = await db.createActor(fixture, role, { access: false });
      const deniedInput = {
        ...input,
        context: await db.staffSessionContext(actor.userId),
        scope: { ...input.scope, membershipId: actor.membershipId },
      };
      await expect(
        inPostgresTransaction(db.runtimePool, (tx) =>
          queryRetrievalStageAlertCases(tx, deniedInput),
        ),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    }
  });

  it("does not leak a Task outside the LM's selected owning Location even with a current exact grant", async () => {
    const input = await phaseReaderInput(db);
    const task = await seedPhaseStage(db, "ACCEPTED");
    const fixture = await db.managerFixture();
    // Same LM is legitimately granted this *other* Location, but the
    // persisted Task remains owned by the original Location.
    const otherLocationId = await db.addLocation(fixture);
    const otherScope = {
      ...input,
      scope: { ...input.scope, locationId: otherLocationId },
    };
    const actual = await inPostgresTransaction(db.runtimePool, (tx) =>
      queryRetrievalStageAlertCases(tx, otherScope),
    );
    expect(actual.some((item) => item.sourceId === task.taskId)).toBe(false);
    expect(
      await inPostgresTransaction(db.runtimePool, (tx) =>
        findRetrievalStageAlertCaseById(
          tx,
          otherScope,
          task.taskId,
          `${task.taskId}:3`,
        ),
      ),
    ).toBeNull();
  });

  it("rejects a Company Admin's source read without established MFA", async () => {
    const input = await phaseReaderInput(db);
    await seedPhaseStage(db, "ACCEPTED");
    const fixture = await db.managerFixture();
    const admin = await db.createActor(fixture, "ORG_ADMIN");
    const adminInput = {
      ...input,
      context: await db.staffSessionContext(admin.userId),
      scope: { ...input.scope, membershipId: admin.membershipId },
    };
    await expect(
      inPostgresTransaction(db.runtimePool, (tx) =>
        queryRetrievalStageAlertCases(tx, adminInput),
      ),
    ).rejects.toThrow();
  });
});
