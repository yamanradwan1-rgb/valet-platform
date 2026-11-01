import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PresenceManagementService } from "../src/modules/management/presence-management.service";
import { StaffManagementMutationService } from "../src/modules/management/staff-management-mutation.service";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { presenceReadProbe } from "./shift-presence-read-probe";
import {
  presenceCommitBarrier,
  observePresenceCommandWait,
  abortPresenceCommitBarriers,
} from "./shift-presence-commit-test-helper";

const db = new PresenceServerTestContext("issue406-read-authority-races");
beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 60_000);
afterEach(() => abortPresenceCommitBarriers());

describe("Issue 406: retried reads always re-prove current authority", () => {
  it.each(
    (["grant", "membership"] as const).flatMap((kind) =>
      (["COMMIT", "ROLLBACK"] as const).map((outcome) => ({ kind, outcome })),
    ),
  )("$kind invalidation first, $outcome", async ({ kind, outcome }) => {
    const f = await db.createFixture();
    const ca = await db.manager(f);
    const lm = await db.manager(f, "LOCATION_MANAGER");
    const gate = presenceCommitBarrier(db.runtimePool);
    const staff = new StaffManagementMutationService(gate.pool);
    const invalidator = (
      kind === "grant"
        ? staff.locationAccess(
            ca.context,
            f.organizationId,
            lm.membershipId,
            { expectedVersion: 1, locationIds: [f.locationId] },
            false,
          )
        : staff.status(
            ca.context,
            f.organizationId,
            lm.membershipId,
            { expectedVersion: 1 },
            "INACTIVE",
          )
    ).catch((error) => error);
    await gate.atCommit;
    const probe = presenceReadProbe(db.runtimePool);
    const read = new PresenceManagementService(probe.pool)
      .location(lm.context, lm.target)
      .catch((error) => error);
    await probe.atBusy;
    gate.finish(outcome);
    await invalidator;
    const result = await read;
    if (outcome === "COMMIT")
      expect(result).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    else
      expect(result).toMatchObject({
        locationId: f.locationId,
        capabilities: { canEdit: true },
      });
    expect(
      probe.statements.filter((sql) => sql === "BEGIN").length,
    ).toBeGreaterThan(1);
    expect(
      probe.statements.filter((sql) =>
        sql.includes("FROM staff_auth_sessions AS session"),
      ).length,
    ).toBeGreaterThan(1);
  });

  it.each(["session", "user", "mfa", "entitlement"] as const)(
    "%s revocation during contention is effective",
    async (kind) => {
      const f = await db.createFixture();
      const ca = await db.manager(f);
      const subject = await db.manager(f);
      const gate = presenceCommitBarrier(db.runtimePool);
      const invalidator = new StaffManagementMutationService(gate.pool)
        .status(
          ca.context,
          f.organizationId,
          f.membershipId,
          { expectedVersion: 1 },
          "INACTIVE",
        )
        .catch((error) => error);
      await gate.atCommit;
      const probe = presenceReadProbe(db.runtimePool);
      const read = new PresenceManagementService(probe.pool)
        .company(subject.context, subject.companyTarget)
        .catch((error) => error);
      await probe.atBusy;
      if (kind === "session")
        await db.adminPool.query(
          "UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1",
          [subject.context.staffAuthSessionId],
        );
      if (kind === "user")
        await db.adminPool.query(
          "UPDATE users SET status='DISABLED' WHERE id=$1",
          [subject.userId],
        );
      if (kind === "mfa")
        await db.adminPool.query(
          "UPDATE staff_auth_sessions SET mfa_authenticated_at=NULL,mfa_factor_id=NULL,last_admin_activity_at=NULL WHERE id=$1",
          [subject.context.staffAuthSessionId],
        );
      if (kind === "entitlement")
        await db.adminPool.query(
          "UPDATE organization_subscriptions SET dashboard_access_enabled=FALSE WHERE organization_id=$1",
          [f.organizationId],
        );
      gate.finish("COMMIT");
      await invalidator;
      expect(await read).toMatchObject(
        kind === "session" || kind === "user"
          ? { status: 401 }
          : {
              code:
                kind === "mfa"
                  ? "MFA_STEP_UP_REQUIRED"
                  : "AUTHORIZATION_DENIED",
            },
      );
      expect(
        probe.statements.filter((sql) => sql === "BEGIN").length,
      ).toBeGreaterThan(1);
    },
  );

  it("a read that wins its protected interval completes before a later grant revocation", async () => {
    const f = await db.createFixture();
    const ca = await db.manager(f);
    const lm = await db.manager(f, "LOCATION_MANAGER");
    const gate = presenceCommitBarrier(db.runtimePool);
    const read = new PresenceManagementService(gate.pool).location(
      lm.context,
      lm.target,
    );
    await gate.atCommit;
    const revoke = new StaffManagementMutationService(
      db.runtimePool,
    ).locationAccess(
      ca.context,
      f.organizationId,
      lm.membershipId,
      { expectedVersion: 1, locationIds: [f.locationId] },
      false,
    );
    await observePresenceCommandWait(db);
    gate.finish("COMMIT");
    expect((await read).locationId).toBe(f.locationId);
    await revoke;
    await expect(
      db.management.location(lm.context, lm.target),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("mutation and exact-result reconciliation remain single-attempt and fail closed", async () => {
    const f = await db.createFixture();
    const ca = await db.manager(f);
    const lm = await db.manager(f, "LOCATION_MANAGER");
    const gate = presenceCommitBarrier(db.runtimePool);
    const invalidator = new StaffManagementMutationService(gate.pool)
      .status(
        ca.context,
        f.organizationId,
        f.membershipId,
        { expectedVersion: 1 },
        "INACTIVE",
      )
      .catch((error) => error);
    await gate.atCommit;
    const zoneId = randomUUID();
    for (const kind of ["mutation", "result"] as const) {
      const probe = presenceReadProbe(db.runtimePool);
      const service = new PresenceManagementService(probe.pool);
      const operation =
        kind === "mutation"
          ? service.saveZone(lm.context, lm.target, {
              mutationId: randomUUID(),
              zoneId,
              code: "NEW",
              label: "Synthetic",
              latitude: 31.95,
              longitude: 35.91,
              radiusMeters: 50,
              state: "ACTIVE",
            })
          : service.result(lm.context, lm.target, randomUUID());
      await expect(operation).rejects.toMatchObject({
        code: "PRESENCE_AUTHORITY_BUSY",
      });
      expect(probe.statements.filter((sql) => sql === "BEGIN")).toHaveLength(1);
      expect(probe.statements.at(-1)).toBe("ROLLBACK");
    }
    expect(
      (
        await db.adminPool.query(
          "SELECT id FROM shift_presence_zones WHERE id=$1",
          [zoneId],
        )
      ).rowCount,
    ).toBe(0);
    gate.finish("ROLLBACK");
    await invalidator;
  });
});
