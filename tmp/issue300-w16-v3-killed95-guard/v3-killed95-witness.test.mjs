import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  confirmKilled95Wait, confirmKilled95Death, killed95AppName,
  killed95WaitSql, killed95BackendSql, backendStillPresent95,
  verifyBackendGone95, heldLockExitBarrier95, witnessAndKill95,
} from "./v3-killed95-witness.mjs";

const appName = "issue300_v3_k95_" + "a".repeat(24);
const startedAtMs = Date.parse("2026-10-20T00:00:00.000Z");
function matchingRow(override = {}) {
  return {
    pid: 147,
    application_name: appName,
    backend_start: new Date(startedAtMs + 15).toISOString(),
    query_start: new Date(startedAtMs + 25).toISOString(),
    query: "LOCK TABLE public.audit_events, public.tasks, public.incidents, " +
      "public.valet_sessions IN ACCESS EXCLUSIVE MODE;",
    locktype: "relation", namespace: "public", relation: "tasks",
    mode: "AccessExclusiveLock", granted: false,
    wait_event_type: "Lock", wait_event: "relation",
    ...override,
  };
}
function fakeChild({ alive = true, killReturn = true,
  killExit = { code: null, signal: "SIGKILL" } } = {}) {
  const child = new EventEmitter();
  Object.assign(child, { pid: 9123, exitCode: alive ? null : 1,
    signalCode: null, killed: false, kills: 0 });
  child.kill = signal => {
    child.kills++;
    if (!killReturn) return false;
    child.killed = true;
    queueMicrotask(() => {
      child.exitCode = killExit.code;
      child.signalCode = killExit.signal;
      child.emit("exit", killExit.code, killExit.signal);
    });
    return true;
  };
  const exitPromise = new Promise(resolve =>
    child.once("exit", (code, signal) => resolve({ code, signal, error: null })));
  return { child, exitPromise };
}
function inputs(opts = {}, rows = [matchingRow()]) {
  const process = fakeChild(opts);
  return { ...process, appName, startedAtMs,
    readWaitRows: async () => rows, readBackendRows: async () => [],
    sleep: async () => {},
    polls: 1, exitTimeoutMs: 20 };
}

test("offline guard requires a nonce-tagged exact PG tasks migration95 wait", () => {
  const { child } = fakeChild();
  const expected = confirmKilled95Wait([matchingRow()],
    { child, appName, startedAtMs });
  assert.equal(expected.backendPid, 147);
  assert.equal(expected.migration95StatementMatched, true);
  assert.match(killed95WaitSql, /l\.relation = 'public\.tasks'::regclass/);
  assert.match(killed95AppName(), /^issue300_v3_k95_[a-f0-9]{24}$/);
});

test("offline positive: fresh verified PG lock, target lives, SIGKILL and signal exit", async () => {
  const args = inputs();
  const found = await witnessAndKill95(args);
  assert.equal(found.observedExitSignal, "SIGKILL");
  assert.equal(found.backendPid, 147);
  assert.equal(found.backendDrained, true);
  assert.equal(found.backendDrainSamples, 2);
  assert.equal(args.child.kills, 1);
});

test("offline negative: an unrelated backend's lock cannot establish killed95", async () => {
  for (const row of [
    matchingRow({ application_name: "other-migration" }),
    matchingRow({ relation: "incidents" }),
    matchingRow({ mode: "RowExclusiveLock" }),
    matchingRow({ wait_event_type: "IO" }),
    matchingRow({ query: "ALTER TABLE public.tasks ADD COLUMN arbitrary int" }),
    matchingRow({ backend_start: new Date(startedAtMs - 10_000).toISOString() }),
  ]) {
    const args = inputs({}, [row]);
    await assert.rejects(witnessAndKill95(args),
      /KILLED95_UNRELATED|KILLED95_OLD/);
    assert.equal(args.child.kills, 0);
  }
  const none = inputs({}, []);
  await assert.rejects(witnessAndKill95(none), /KILLED95_NO_CHILD_TAGGED/);
  assert.equal(none.child.kills, 0);
});

test("offline negative: pre-dead child and already-signaled child refuse", async () => {
  const dead = inputs({ alive: false });
  await assert.rejects(witnessAndKill95(dead), /KILLED95_CHILD_PREDEAD/);
  assert.equal(dead.child.kills, 0);
  const signaling = inputs();
  signaling.child.killed = true;
  await assert.rejects(witnessAndKill95(signaling), /KILLED95_CHILD_PREDEAD/);
  assert.equal(signaling.child.kills, 0);
});

test("offline negative: child.kill returning false cannot qualify", async () => {
  const args = inputs({ killReturn: false });
  await assert.rejects(witnessAndKill95(args), /KILLED95_SIGNAL_SEND_FAILED/);
  assert.equal(args.child.kills, 1);
});

test("offline negative: failed to observe actual SIGKILL exit", async () => {
  for (const killExit of [
    { code: 1, signal: null },
    { code: 0, signal: null },
    { code: null, signal: "SIGTERM" },
  ]) {
    const args = inputs({ killExit });
    await assert.rejects(witnessAndKill95(args),
      /KILLED95_NO_OBSERVED_SIGKILL_EXIT/);
  }
  assert.throws(() => confirmKilled95Death({
    accepted: false, exit: { code: null, signal: "SIGKILL", error: null },
    witness: { backendPid: 147, migration95StatementMatched: true },
  }), /KILLED95_SIGNAL_SEND_FAILED/);
  const noExit = inputs();
  noExit.child.kill = () => true; // signal accepted, but no process exit event.
  noExit.exitTimeoutMs = 5;
  await assert.rejects(witnessAndKill95(noExit),
    /KILLED95_EXIT_UNOBSERVED_TIMEOUT/);
});

test("offline negative: a backend swap between wait and kill refuses", async () => {
  const args = inputs();
  let reads = 0;
  args.readWaitRows = async () => [matchingRow({
    pid: ++reads === 1 ? 147 : 148,
  })];
  await assert.rejects(witnessAndKill95(args),
    /KILLED95_BACKEND_SWAPPED_BEFORE_KILL/);
  assert.equal(args.child.kills, 0);
});

test("offline negative: ambiguous multiple matching backend waits refuse", async () => {
  const args = inputs({}, [matchingRow(), matchingRow({ pid: 148 })]);
  await assert.rejects(witnessAndKill95(args),
    /KILLED95_EXACT_SINGLE_BACKEND_LOCK_WITNESS_REQUIRED/);
  assert.equal(args.child.kills, 0);
});

test("offline negative: CLI SIGKILL exit but exact PG backend PID/start STILL ALIVE", async () => {
  const args = inputs();
  args.readBackendRows = async () => [{
    pid: 147, application_name: "unknown-possibly-detached",
    backend_start: matchingRow().backend_start,
  }];
  await assert.rejects(witnessAndKill95(args),
    /KILLED95_BACKEND_STILL_PRESENT_UNKNOWN_QUARANTINE/);
  assert.equal(args.child.kills, 1); // OS death alone cannot pass
});

test("offline negative: tagged backend reconnects under different PID", async () => {
  const args = inputs();
  args.readBackendRows = async () => [{
    pid: 981, application_name: appName,
    backend_start: matchingRow().backend_start,
  }];
  await assert.rejects(witnessAndKill95(args),
    /KILLED95_BACKEND_STILL_PRESENT_UNKNOWN_QUARANTINE/);
  assert.match(killed95BackendSql, /WHERE pid = \$1 OR/);
  assert(backendStillPresent95([{
    pid: 981, application_name: appName,
    backend_start: matchingRow().backend_start,
  }], { backendPid: 147, applicationName: appName,
    backendStart: startedAtMs + 15 }));
});

test("offline negative: untrustworthy or failed PG backend drain read refuses", async () => {
  const bad = inputs();
  bad.readBackendRows = async () => [{ pid: 147, application_name: appName }];
  await assert.rejects(witnessAndKill95(bad),
    /KILLED95_BACKEND_DRAIN_ROW_UNTRUSTED/);
  const thrown = inputs();
  thrown.readBackendRows = async () => { throw Error("PG_UNREACHABLE"); };
  await assert.rejects(witnessAndKill95(thrown), /PG_UNREACHABLE/);
});

test("offline positive: drain requires two independent zero-row PG snapshots", async () => {
  const witness = { backendPid: 147, applicationName: appName,
    backendStart: startedAtMs + 15 };
  const sequence = [
    [{ pid: 147, application_name: appName,
      backend_start: matchingRow().backend_start }],
    [], [],
  ];
  const gone = await verifyBackendGone95({
    witness, readBackendRows: async () => sequence.shift(),
    sleep: async () => {}, attempts: 3,
  });
  assert.equal(gone.backendDrainSamples, 3);
  assert.equal(gone.nonceSessionsGone, true);
});

test("offline fail-path: quarantine stops owned PG BEFORE holder unlock", async () => {
  const events = [];
  const status = await heldLockExitBarrier95({
    verifiedDrain: false,
    markUnknown: async () => events.push("UNKNOWN"),
    stopOwnedPg: async () => { events.push("PG_STOP_CONFIRMED"); return true; },
    releaseHeldLock: async () => events.push("RELEASE"),
  });
  assert.equal(status, "UNKNOWN_QUARANTINED_PG_STOPPED");
  assert.deepEqual(events, ["UNKNOWN", "PG_STOP_CONFIRMED", "RELEASE"]);
});

test("offline fail-path: unconfirmed PostgreSQL stop MUST NOT unlock", async () => {
  for (const stopOwnedPg of [
    async () => false,
    async () => { throw Error("STOP_FAILED"); },
  ]) {
    let released = 0, marked = 0;
    await assert.rejects(heldLockExitBarrier95({
      verifiedDrain: false,
      markUnknown: async () => { marked++; },
      stopOwnedPg,
      releaseHeldLock: async () => { released++; },
    }));
    assert.equal(marked, 1);
    assert.equal(released, 0);
  }
  let released = 0;
  const status = await heldLockExitBarrier95({
    verifiedDrain: true,
    releaseHeldLock: async () => { released++; },
  });
  assert.equal(status, "VERIFIED_DRAINED");
  assert.equal(released, 1);
});
