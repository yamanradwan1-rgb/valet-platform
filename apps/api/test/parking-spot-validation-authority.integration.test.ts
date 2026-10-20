import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createParkingSpotValidationQuery } from "../src/modules/parking/parking-spot-validation-query";
import { ConfirmParkedTestContext } from "./confirm-parked-test-context";
import { validationInput } from "./parking-spot-validation-test-support";

const context = new ConfirmParkedTestContext("264_authority");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("#264 exact current operational authority", () => {
  it.each([
    "other-employee",
    "other-supervisor",
    "foreign",
    "ORG_ADMIN",
    "LOCATION_MANAGER",
  ])("conceals %s actor", async (actor) => {
    const f = await context.createConfirmParkedFixture();
    const other =
      actor === "foreign"
        ? await context.createConfirmParkedFixture()
        : await context.addMember(
            f,
            actor === "other-supervisor"
              ? "VALET_SUPERVISOR"
              : actor === "ORG_ADMIN" || actor === "LOCATION_MANAGER"
                ? actor
                : "VALET_EMPLOYEE",
            actor.startsWith("other-"),
          );
    if (actor === "ORG_ADMIN" || actor === "LOCATION_MANAGER") {
      await context.adminPool.query(
        `INSERT INTO shifts
        (id, organization_id, location_id, membership_id, status, started_at)
        VALUES ($1, $2, $3, $4, 'ACTIVE', now())`,
        [randomUUID(), f.organizationId, f.locationId, other.membershipId],
      );
      await context.adminPool.query(
        `UPDATE tasks SET current_assignee_membership_id = $1 WHERE id = $2`,
        [other.membershipId, f.taskId],
      );
    }
    const shift = await context.adminPool.query<{ id: string }>(
      `SELECT id::text FROM shifts WHERE membership_id = $1 AND status = 'ACTIVE'`,
      [other.membershipId],
    );
    await expect(
      createParkingSpotValidationQuery(context.runtimePool)({
        ...(await validationInput(context, f)),
        expectedShiftId: shift.rows[0]!.id,
        authenticatedUserId: other.userId,
      }),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
  });

  it.each([
    ["user", `UPDATE users SET status = 'DISABLED' WHERE id = $1`, "userId"],
    [
      "membership",
      `UPDATE organization_memberships SET status = 'INACTIVE' WHERE id = $1`,
      "membershipId",
    ],
    [
      "organization",
      `UPDATE organizations SET status = 'INACTIVE' WHERE id = $1`,
      "organizationId",
    ],
    [
      "location",
      `UPDATE locations SET status = 'INACTIVE', accepting_intake = false WHERE id = $1`,
      "locationId",
    ],
    [
      "access",
      `DELETE FROM membership_location_access WHERE membership_id = $1`,
      "membershipId",
    ],
    [
      "shift",
      `UPDATE shifts SET status = 'ENDED', ended_at = now() WHERE membership_id = $1`,
      "membershipId",
    ],
  ] as const)("rejects invalid %s", async (_name, sql, key) => {
    const f = await context.createConfirmParkedFixture();
    const input = await validationInput(context, f);
    await context.adminPool.query(sql, [f[key]]);
    await expect(
      createParkingSpotValidationQuery(context.runtimePool)(input),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
  });

  it("accepts self-owned Supervisor work", async () => {
    const f = await context.createConfirmParkedFixture({
      role: "VALET_SUPERVISOR",
    });
    expect(
      await createParkingSpotValidationQuery(context.runtimePool)(
        await validationInput(context, f),
      ),
    ).toMatchObject({ available: true });
  });

  it.each([
    "wrong-shift",
    "replaced-shift",
    "shift-location",
    "wrong-task",
    "wrong-session",
    "retrieval",
  ])("rejects exact target mismatch %s", async (scenario) => {
    const f = await context.createConfirmParkedFixture();
    const input = await validationInput(context, f);
    if (scenario === "wrong-shift") input.expectedShiftId = randomUUID();
    if (scenario === "replaced-shift") {
      await context.adminPool.query(
        `UPDATE shifts SET status = 'ENDED', ended_at = now() WHERE id = $1`,
        [input.expectedShiftId],
      );
      await context.adminPool.query(
        `INSERT INTO shifts (id, organization_id, location_id, membership_id, status, started_at)
          VALUES ($1, $2, $3, $4, 'ACTIVE', now())`,
        [randomUUID(), f.organizationId, f.locationId, f.membershipId],
      );
    }
    if (scenario === "shift-location")
      await context.adminPool.query(
        `UPDATE shifts SET location_id = $1 WHERE id = $2`,
        [await context.addLocation(f), input.expectedShiftId],
      );
    if (scenario === "wrong-task")
      input.taskId = (await context.createConfirmParkedFixture()).taskId;
    if (scenario === "wrong-session")
      input.sessionId = (await context.createConfirmParkedFixture()).sessionId;
    if (scenario === "retrieval")
      {
        const retrievalTaskId = randomUUID();
        await context.adminPool.query(
          `INSERT INTO tasks (id, organization_id, location_id, valet_session_id,
            task_type, status, current_assignee_membership_id, version, updated_at)
           SELECT $2, organization_id, location_id, valet_session_id,
             'RETRIEVAL', status, current_assignee_membership_id, version, updated_at
           FROM tasks WHERE id = $1`,
          [f.taskId, retrievalTaskId],
        );
        input.taskId = retrievalTaskId;
      }
    await expect(
      createParkingSpotValidationQuery(context.runtimePool)(input),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
  });

  it.each(["session-version", "task-version", "task-state", "session-state"])(
    "preserves %s error family",
    async (scenario) => {
      const f = await context.createConfirmParkedFixture();
      const input = await validationInput(context, f);
      if (scenario === "session-version") input.expectedSessionVersion = 2;
      if (scenario === "task-version") input.expectedTaskVersion = 3;
      if (scenario === "task-state")
        await context.adminPool.query(
          `UPDATE tasks SET status = 'ACCEPTED' WHERE id = $1`,
          [f.taskId],
        );
      if (scenario === "session-state")
        await context.adminPool.query(
          `UPDATE valet_sessions SET state = 'AWAITING_PARKING' WHERE id = $1`,
          [f.sessionId],
        );
      const code = scenario.endsWith("version")
        ? "VERSION_CONFLICT"
        : scenario === "task-state"
          ? "TASK_INVALID_STATE"
          : "INVALID_STATE_TRANSITION";
      await expect(
        createParkingSpotValidationQuery(context.runtimePool)(input),
      ).rejects.toMatchObject({ code });
    },
  );
});
