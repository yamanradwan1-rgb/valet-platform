// Source-only lease/lock mock: NEVER starts PG, Docker, Prisma or a service.
import test from "node:test";
import assert from "node:assert/strict";
import { guardedSqlConnection } from "./v3-sql-lease-watchdog.mjs";
import { heldLockExitBarrier95 } from "./v3-killed95-witness.mjs";

function makeHolder(stop) {
  let clock = 0, revokedTick, events = [];
  const leaseId = "test-owner-v3";
  const client = {
    connection: { stream: { destroy: () => events.push("DESTROY_SOCKET") } },
    async connect() { events.push("CONNECT"); },
    async query(q) { events.push(q); return { rows: [] }; },
    async end() { events.push("END_CONNECTION"); },
  };
  const guard = guardedSqlConnection(client, {
    leaseId,
    assertCurrentLease: () => ({
      leaseId, expiresAt: new Date(60_000).toISOString(),
    }),
    now: () => clock,
    setPoll: tick => { revokedTick = tick; return 1; },
    clearPoll: () => { revokedTick = null; },
    quarantineBeforeSocketDestroy: async () => {
      events.push("QUARANTINE_START");
      const confirmed = await stop();
      events.push(confirmed ? "PG_STOPPED" : "PG_STOP_UNKNOWN");
      return confirmed;
    },
  });
  return { client, guard, events,
    expire: () => { clock = 60_001; revokedTick(); } };
}

test("positive: live owned writer keeps lock until verified drain", async () => {
  const h = makeHolder(async () => true);
  await h.guard.run(async c => {
    await c.query("BEGIN");
    await c.query("LOCK TABLE public.tasks IN ROW EXCLUSIVE MODE");
  });
  const result = await heldLockExitBarrier95({
    verifiedDrain: true,
    releaseHeldLock: async () => {
      await h.client.query("ROLLBACK");
      await h.guard.close();
    },
  });
  assert.equal(result, "VERIFIED_DRAINED");
  assert(h.events.includes("ROLLBACK"));
  assert(!h.events.includes("QUARANTINE_START"));
});

test("negative: expired Owner SQL lease STOPPED before holder socket destruction", async () => {
  const h = makeHolder(async () => true);
  await h.guard.run(async c => {
    await c.query("BEGIN");
    await c.query("LOCK TABLE public.tasks IN ROW EXCLUSIVE MODE");
  });
  h.expire();
  assert.equal(await h.guard.quarantineResult, true);
  const stop = h.events.indexOf("PG_STOPPED");
  const destroy = h.events.indexOf("DESTROY_SOCKET");
  assert(stop >= 0 && destroy > stop);
  await assert.rejects(h.client.query("COMMIT"), /lease rejected/);
  assert(!h.events.includes("COMMIT"));
  await h.guard.close();
});

test("negative: if emergency PG stop fails, revoked holder lock socket stays", async () => {
  const h = makeHolder(async () => false);
  await h.guard.run(async c => {
    await c.query("BEGIN");
    await c.query("LOCK TABLE public.tasks IN ROW EXCLUSIVE MODE");
  });
  h.expire();
  assert.equal(await h.guard.quarantineResult, false);
  assert(h.events.includes("PG_STOP_UNKNOWN"));
  assert(!h.events.includes("DESTROY_SOCKET"));
  assert(!h.events.includes("END_CONNECTION"));
  await assert.rejects(h.client.query("COMMIT"), /lease rejected/);
  await h.guard.close();
  assert(!h.events.includes("DESTROY_SOCKET"));
});

test("negative: thrown quarantine hook fails closed without destroying PG socket", async () => {
  const h = makeHolder(async () => { throw Error("OWNER_STOP_UNAVAILABLE"); });
  await h.guard.run(async c => c.query("BEGIN"));
  h.expire();
  assert.equal(await h.guard.quarantineResult, false);
  assert(!h.events.includes("DESTROY_SOCKET"));
  await assert.rejects(h.client.query("COMMIT"), /lease rejected/);
});

test("negative: even if UNKNOWN journal fails, try owned PG stop before release", async () => {
  const order = [];
  await assert.rejects(heldLockExitBarrier95({
    verifiedDrain: false,
    markUnknown: async () => { order.push("MARK_FAILED"); throw Error("FS"); },
    stopOwnedPg: async () => { order.push("STOP_CONFIRMED"); return true; },
    releaseHeldLock: async () => { order.push("RELEASE"); },
  }), /KILLED95_QUARANTINE_MARKER_FAILED_UNKNOWN/);
  assert.deepEqual(order, ["MARK_FAILED", "STOP_CONFIRMED", "RELEASE"]);
});
