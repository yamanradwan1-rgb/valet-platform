import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, it, vi } from "vitest";

import {
  createIssue442LocationContext,
  holdLocationLifecycle,
  prepare,
} from "./issue442-emergency-location-fixture";
import { createIssue442RaceSupport } from "./issue442-emergency-location-test-support";

const context = createIssue442LocationContext("positive");
type HttpResult = Awaited<ReturnType<typeof context.staffPost>>;
const {
  emergency,
  stop,
  blockedBy,
  deadlocks,
  assertNoDeadlocks,
  verifyCommitted,
} = createIssue442RaceSupport(context);

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

describe("Issue #442 positive Emergency Takeover vs Location lifecycle order", () => {
  it("serializes Task-locked Emergency first, then real Stop Intake without deadlock", async () => {
    const f = await prepare(context);
    const before = await deadlocks();
    const barrier = await context.adminPool.connect();
    let transfer: Promise<HttpResult> | undefined;
    let stopped: Promise<HttpResult> | undefined;
    try {
      await barrier.query("BEGIN");
      await barrier.query("SELECT id FROM tasks WHERE id=$1 FOR UPDATE", [
        f.taskId,
      ]);
      const pid = (
        await barrier.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
      ).rows[0]!.pid;
      transfer = emergency(f);
      const takeoverPid = await blockedBy(pid);
      stopped = stop(f);
      await blockedBy(takeoverPid);
      await barrier.query("COMMIT");
      await verifyCommitted(f, await transfer, await stopped);
      await assertNoDeadlocks(before);
    } finally {
      await barrier.query("ROLLBACK").catch(() => undefined);
      barrier.release();
      await Promise.allSettled(
        [transfer, stopped].filter((p) => p !== undefined),
      );
    }
  }, 120_000);

  it("serializes Location-locked Stop Intake first, then Emergency without deadlock", async () => {
    const f = await prepare(context);
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
      await verifyCommitted(f, await transfer, await stopped);
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
