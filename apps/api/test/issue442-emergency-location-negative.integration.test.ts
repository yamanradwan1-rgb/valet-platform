import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createIssue442LocationContext,
  effects,
  holdLocationLifecycle,
  makeStaleStop,
  prepare,
} from "./issue442-emergency-location-fixture";
import { createIssue442RaceSupport } from "./issue442-emergency-location-test-support";

const context = createIssue442LocationContext("negative");
type HttpResult = Awaited<ReturnType<typeof context.staffPost>>;
const { emergency, stop, blockedBy, deadlocks, assertNoDeadlocks } =
  createIssue442RaceSupport(context);

beforeAll(async () => {
  const create = NestFactory.create.bind(NestFactory);
  const spy = vi
    .spyOn(NestFactory, "create")
    .mockImplementation((module, options) =>
      create(module, { ...options, abortOnError: false, logger: ["error"] }),
    );
  try {
    await context.setupGate();
  } finally {
    spy.mockRestore();
  }
}, 300_000);
afterAll(() => context.teardownGate(), 60_000);

describe("Issue #442 negative Emergency Takeover vs Location lifecycle order", () => {
  it("rejects the real Emergency after Native Logout revokes its blocked Staff Session", async () => {
    const f = await prepare(context);
    const unchanged = await effects(context, f);
    const before = await deadlocks();
    const { barrier, pid } = await holdLocationLifecycle(context, f.locationId);
    let transfer: Promise<HttpResult> | undefined;
    try {
      transfer = emergency(f);
      await blockedBy(pid);

      // Native Logout is the real production revoker; no direct session update.
      const logout = await context.request(
        "POST",
        "/v1/staff/auth/native/logout",
        {
          body: { refreshToken: f.adminRefreshToken },
        },
      );
      expect(logout.status).toBe(204);
      const session = await context.adminPool.query<{
        revoked_at: Date | null;
      }>("SELECT revoked_at FROM staff_auth_sessions WHERE id=$1", [
        f.adminSessionId,
      ]);
      expect(session.rows[0]?.revoked_at).toBeInstanceOf(Date);

      await barrier.query("COMMIT");
      expect(await transfer).toMatchObject({
        status: 401,
        body: { code: "STAFF_AUTHENTICATION_REQUIRED" },
      });
      expect(await effects(context, f)).toEqual(unchanged);
      await assertNoDeadlocks(before);
    } finally {
      await barrier.query("ROLLBACK").catch(() => undefined);
      barrier.release();
      await Promise.allSettled([transfer].filter((p) => p !== undefined));
    }
  }, 120_000);

  it("rolls back a real Stop Intake CAS-stale writer racing with Emergency, then retries safely", async () => {
    const f = await prepare(context);
    const freshUpdatedAt = await makeStaleStop(context, f);
    expect(freshUpdatedAt).not.toBe(f.stop.expectedUpdatedAt);
    const original = await effects(context, f);
    const before = await deadlocks();
    const { barrier, pid } = await holdLocationLifecycle(context, f.locationId);
    let transfer: Promise<HttpResult> | undefined;
    let stopped: Promise<HttpResult> | undefined;
    try {
      stopped = stop(f);
      const stopPid = await blockedBy(pid);
      transfer = emergency(f);
      await blockedBy(pid, [stopPid]);
      await barrier.query("COMMIT");

      const [stale, takeover] = await Promise.all([stopped, transfer]);
      expect(stale).toMatchObject({
        status: 409,
        body: { code: "LOCATION_LIFECYCLE_CONFLICT" },
      });
      expect(takeover).toMatchObject({
        status: 200,
        body: { replayed: false, task: { assigneeMembershipId: f.newOwner } },
      });
      const committed = await effects(context, f);
      expect(committed).toMatchObject({
        task_version: original.task_version + 1,
        session_version: original.session_version + 1,
        owner: f.newOwner,
        dispatch_count: original.dispatch_count + 1,
        audit_count: original.audit_count + 1,
        receipt_count: original.receipt_count + 1,
        accepting_intake: true,
        updated_at: original.updated_at,
        stop_audit_count: original.stop_audit_count,
      });
      const recovered = await context.staffPost(
        f.adminToken,
        `/v1/staff/management/organizations/${f.organizationId}/locations/${f.locationId}/stop-intake`,
        { expectedUpdatedAt: freshUpdatedAt },
      );
      expect(recovered).toMatchObject({
        status: 201,
        body: { acceptingIntake: false },
      });
      expect((await effects(context, f)).stop_audit_count).toBe(
        original.stop_audit_count + 1,
      );
      await assertNoDeadlocks(before);
    } finally {
      await barrier.query("ROLLBACK").catch(() => undefined);
      barrier.release();
      await Promise.allSettled(
        [transfer, stopped].filter((p) => p !== undefined),
      );
    }
  }, 120_000);
});
