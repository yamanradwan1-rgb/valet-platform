import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  fixture,
  startIssue333Lab,
  stopIssue333Lab,
} from "./dashboard-issue333-lab";
import {
  closeLockLeases,
  makeLockPool,
  openLockLease,
  sessionShared,
  sessionUnlock,
  trace,
  transactionExclusive,
  waitForBlockers,
} from "./issue333-u002-lock-lab";

let pool: Pool;

beforeAll(async () => {
  await startIssue333Lab();
  pool = makeLockPool();
}, 180_000);

afterAll(async () => {
  try {
    if (pool) await pool.end();
  } finally {
    await stopIssue333Lab();
  }
}, 90_000);

describe("Issue333 U002 W5 — real PG17 CA/LM lock-order falsification", () => {
  it("serializes CA+CA EXCLUSIVE transactions on the same org", async () => {
    const organizationId = randomUUID();
    const [first, second] = await Promise.all([
      openLockLease(pool),
      openLockLease(pool),
    ]);
    try {
      await first.client.query("BEGIN");
      await transactionExclusive(first, organizationId);
      await second.client.query("BEGIN");
      const pending = transactionExclusive(second, organizationId);
      const observation = await waitForBlockers(second.pid, [first.pid]);
      await first.client.query("COMMIT");
      await pending;
      trace("CA_CA", {
        first: first.pid,
        second: second.pid,
        ...observation,
      });
      expect(observation.waitType).toBe("Lock");
    } finally {
      await closeLockLeases(first, second);
    }
  }, 12_000);

  it("orders CA EXCLUSIVE and LM SHARED in either direction", async () => {
    const organizationId = randomUUID();
    const [lm, ca] = await Promise.all([
      openLockLease(pool),
      openLockLease(pool),
    ]);
    try {
      await sessionShared(lm, organizationId);
      await ca.client.query("BEGIN");
      const caWaiting = transactionExclusive(ca, organizationId);
      const caBlocked = await waitForBlockers(ca.pid, [lm.pid]);
      await sessionUnlock(lm, organizationId);
      await caWaiting;
      await ca.client.query("COMMIT");

      await ca.client.query("BEGIN");
      await transactionExclusive(ca, organizationId);
      const lmWaiting = sessionShared(lm, organizationId);
      const lmBlocked = await waitForBlockers(lm.pid, [ca.pid]);
      await ca.client.query("COMMIT");
      await lmWaiting;
      await sessionUnlock(lm, organizationId);
      trace("CA_LM", {
        ca: ca.pid,
        lm: lm.pid,
        caBlocked: caBlocked.blockers,
        lmBlocked: lmBlocked.blockers,
      });
      expect(caBlocked.blockers).toEqual([lm.pid]);
      expect(lmBlocked.blockers).toEqual([ca.pid]);
    } finally {
      await closeLockLeases(lm, ca);
    }
  }, 14_000);

  it("allows LM+LM SHARED while revoker EXCLUSIVE waits for both", async () => {
    const organizationId = randomUUID();
    const [first, second, revoker] = await Promise.all([
      openLockLease(pool),
      openLockLease(pool),
      openLockLease(pool),
    ]);
    try {
      await Promise.all([
        sessionShared(first, organizationId),
        sessionShared(second, organizationId),
      ]);
      await revoker.client.query("BEGIN");
      const pending = transactionExclusive(revoker, organizationId);
      const both = await waitForBlockers(revoker.pid, [first.pid, second.pid]);
      await sessionUnlock(first, organizationId);
      const one = await waitForBlockers(revoker.pid, [second.pid]);
      await sessionUnlock(second, organizationId);
      await pending;
      trace("LM_LM_REVOKER", {
        readers: [first.pid, second.pid],
        revoker: revoker.pid,
        blockersBefore: both.blockers,
        blockersAfterFirst: one.blockers,
      });
      expect(both.blockers).toHaveLength(2);
      expect(one.blockers).toEqual([second.pid]);
    } finally {
      await closeLockLeases(first, second, revoker);
    }
  }, 14_000);

  it("exposes actual SHARED-to-EXCLUSIVE upgrade conflict", async () => {
    const organizationId = randomUUID();
    const [first, second] = await Promise.all([
      openLockLease(pool),
      openLockLease(pool),
    ]);
    try {
      await Promise.all([
        sessionShared(first, organizationId),
        sessionShared(second, organizationId),
      ]);
      await Promise.all([
        first.client.query("BEGIN"),
        second.client.query("BEGIN"),
      ]);
      const attempt = (index: number, promise: Promise<unknown>) =>
        promise.then(
          () => ({ index, code: "OK" }),
          (error: { code?: string }) => ({
            index,
            code: error.code ?? "UNKNOWN",
          }),
        );
      const firstAttempt = attempt(
        0,
        transactionExclusive(first, organizationId),
      );
      const firstBlocked = await waitForBlockers(first.pid, [second.pid]);
      const secondAttempt = attempt(
        1,
        transactionExclusive(second, organizationId),
      );
      const loser = await Promise.race([firstAttempt, secondAttempt]);
      expect(["40P01", "55P03"]).toContain(loser.code);
      const losingLease = loser.index === 0 ? first : second;
      await losingLease.client.query("ROLLBACK");
      await losingLease.client.query("SELECT pg_advisory_unlock_all()");
      const survivor = await (loser.index === 0 ? secondAttempt : firstAttempt);
      expect(survivor.code).toBe("OK");
      trace("UPGRADE_COUNTEREXAMPLE", {
        first: first.pid,
        second: second.pid,
        firstBlocked: firstBlocked.blockers,
        secondUpgradeAttempted: true,
        failedSqlstate: loser.code,
      });
    } finally {
      await closeLockLeases(first, second);
    }
  }, 14_000);

  it("rejects stale LM role hint after a real CA HTTP role change", async () => {
    const user = await fixture.createUser();
    const { organizationId, membershipId } = await fixture.createMembership(
      user.id,
      { role: "LOCATION_MANAGER" },
    );
    const adminUser = await fixture.createUser();
    await fixture.addMembership(organizationId, adminUser.id, "ORG_ADMIN");
    const admin = await fixture.nativeLogin(adminUser);
    await fixture.enrollAndAssure(admin);
    const before = await fixture.query<{ role: string; version: number }>(
      "SELECT role::text, version FROM organization_memberships WHERE id=$1",
      [membershipId],
    );
    expect(before.rows[0]!.role).toBe("LOCATION_MANAGER");
    const change = await fixture.managementPost(
      `/v1/staff/management/organizations/${organizationId}/staff/${membershipId}/role`,
      admin.accessToken,
      { expectedVersion: before.rows[0]!.version, role: "VALET_SUPERVISOR" },
    );
    expect(change.status).toBe(201);
    const reader = await openLockLease(pool);
    try {
      await sessionShared(reader, organizationId);
      const current = await reader.client.query<{ role: string }>(
        "SELECT role::text FROM organization_memberships WHERE id=$1",
        [membershipId],
      );
      expect(current.rows[0]!.role).toBe("VALET_SUPERVISOR");
      trace("ROLE_HINT_RECHECK", {
        readerPid: reader.pid,
        before: before.rows[0]!.role,
        after: current.rows[0]!.role,
        writerStatus: change.status,
        behavior: "test-only recheck; must deny/restart, no upgrade attempted",
      });
    } finally {
      await closeLockLeases(reader);
    }
  }, 35_000);

  it("shows max-4 pool pressure with 3 SHARED readers and queued revoker", async () => {
    const pressure = makeLockPool(4, 650);
    const organizationId = randomUUID();
    const leases = await Promise.all([
      openLockLease(pressure),
      openLockLease(pressure),
      openLockLease(pressure),
      openLockLease(pressure),
    ]);
    const [first, second, third, revoker] = leases;
    try {
      await Promise.all(
        [first, second, third].map((lease) =>
          sessionShared(lease, organizationId),
        ),
      );
      await revoker.client.query("BEGIN");
      const waitingWriter = transactionExclusive(revoker, organizationId);
      const graph = await waitForBlockers(revoker.pid, [
        first.pid,
        second.pid,
        third.pid,
      ]);
      const fifth = pressure.connect().then(
        (client) => {
          client.release();
          return "UNEXPECTED_ACQUIRED";
        },
        () => "ACQUIRE_TIMEOUT",
      );
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(pressure.totalCount).toBe(4);
      expect(pressure.waitingCount).toBe(1);
      expect(await fifth).toBe("ACQUIRE_TIMEOUT");
      await Promise.all(
        [first, second, third].map((lease) =>
          sessionUnlock(lease, organizationId),
        ),
      );
      await waitingWriter;
      trace("POOL_FOUR", {
        readers: [first.pid, second.pid, third.pid],
        revoker: revoker.pid,
        blockers: graph.blockers,
        peakCheckedOut: 4,
        fifth: "ACQUIRE_TIMEOUT",
      });
    } finally {
      await closeLockLeases(...leases);
      await pressure.end();
    }
  }, 15_000);
});
