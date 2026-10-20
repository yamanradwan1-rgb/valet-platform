// W16 isolated V3 killed95 proof guard. No DB/process creation or signing.
// PGAPPNAME is a *candidate* Prisma connection tag, not a verified feature:
// if the backend does not echo it, refuse instead of declaring a PASS.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const MIGRATION95_LOCK = /\bLOCK\s+TABLE\s+public\.audit_events\s*,\s*public\.tasks\s*,\s*public\.incidents\s*,\s*public\.valet_sessions\s+IN\s+ACCESS\s+EXCLUSIVE\s+MODE\b/i;
const NAME = /^issue300_v3_k95_[a-f0-9]{24}$/;
const MIN_CLOCK_SKEW_MS = 2000;

export function killed95AppName() {
  return `issue300_v3_k95_${randomBytes(12).toString("hex")}`;
}

export const killed95WaitSql = `
SELECT a.pid, a.application_name, a.backend_start, a.query_start, a.query,
       a.wait_event_type, a.wait_event, a.datname, a.usename,
       l.locktype, l.mode, l.granted, n.nspname AS namespace,
       relation.relname AS relation
FROM pg_stat_activity a
JOIN pg_locks l ON l.pid = a.pid
JOIN pg_class relation ON relation.oid = l.relation
JOIN pg_namespace n ON n.oid = relation.relnamespace
WHERE a.datname = current_database() AND a.usename = current_user
  AND a.pid <> pg_backend_pid() AND l.locktype = 'relation'
  AND l.relation = 'public.tasks'::regclass
  AND l.mode = 'AccessExclusiveLock' AND l.granted = false
  AND a.wait_event_type = 'Lock' AND a.wait_event = 'relation'
  AND a.application_name = $1`;

// A new independent SQL connection is opened for EVERY post-kill sample.
// Inspect by exact PID even if application_name changed, and by nonce even if
// a detached Prisma engine reconnects with a different backend PID.
export const killed95BackendSql = `
SELECT pid, backend_start, application_name FROM pg_stat_activity
WHERE pid = $1 OR (datname = current_database() AND usename = current_user
  AND application_name = $2)`;

function pgTime(value) {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

export function assertChildLive(child) {
  assert(child && Number.isSafeInteger(child.pid) && child.pid > 0,
    "KILLED95_CHILD_NOT_SPAWNED");
  assert(child.exitCode === null && child.signalCode === null &&
    child.killed !== true, "KILLED95_CHILD_PREDEAD_OR_KILL_PENDING");
}

export function confirmKilled95Wait(rows, { child, appName, startedAtMs }) {
  assertChildLive(child);
  assert(NAME.test(appName) && Number.isSafeInteger(startedAtMs),
    "KILLED95_NONCE_OR_SPAWN_INVALID");
  assert(Array.isArray(rows) && rows.length === 1,
    "KILLED95_EXACT_SINGLE_BACKEND_LOCK_WITNESS_REQUIRED");
  const row = rows[0];
  assert(row && Number.isSafeInteger(row.pid) && row.pid > 0 &&
    row.application_name === appName &&
    row.locktype === "relation" && row.namespace === "public" &&
    row.relation === "tasks" && row.mode === "AccessExclusiveLock" &&
    row.granted === false && row.wait_event_type === "Lock" &&
    row.wait_event === "relation" && MIGRATION95_LOCK.test(row.query ?? ""),
  "KILLED95_UNRELATED_LOCK_OR_MIGRATION95_QUERY");
  const backendStart = pgTime(row.backend_start);
  const queryStart = pgTime(row.query_start);
  assert(Number.isFinite(backendStart) && Number.isFinite(queryStart) &&
    backendStart >= startedAtMs - MIN_CLOCK_SKEW_MS &&
    queryStart >= backendStart && queryStart >= startedAtMs - MIN_CLOCK_SKEW_MS,
  "KILLED95_OLD_OR_UNCORRELATED_BACKEND");
  // No raw backend query, identifiers or credentials are recorded.
  return { backendPid: row.pid, backendStart, queryStart,
    applicationName: appName, blockedRelation: "public.tasks",
    blockedMode: "AccessExclusiveLock", migration95StatementMatched: true };
}

export function confirmKilled95Death({ accepted, exit, witness }) {
  assert(witness?.migration95StatementMatched === true &&
    witness.backendPid > 0, "KILLED95_NO_CORRELATED_WAIT");
  assert(accepted === true, "KILLED95_SIGNAL_SEND_FAILED");
  assert(exit && exit.error === null && exit.code === null &&
    exit.signal === "SIGKILL", "KILLED95_NO_OBSERVED_SIGKILL_EXIT");
  return { ...witness, signalSent: true, observedExitSignal: "SIGKILL",
    processExitCode: null };
}

export function backendStillPresent95(rows, witness) {
  assert(Array.isArray(rows) && witness?.backendPid > 0 &&
    NAME.test(witness.applicationName) && Number.isFinite(witness.backendStart),
  "KILLED95_BACKEND_DRAIN_QUERY_UNTRUSTED");
  return rows.some(row => {
    assert(row && Number.isSafeInteger(row.pid) && row.pid > 0 &&
      Number.isFinite(pgTime(row.backend_start)) &&
      typeof row.application_name === "string",
    "KILLED95_BACKEND_DRAIN_ROW_UNTRUSTED");
    return row.application_name === witness.applicationName ||
      (row.pid === witness.backendPid &&
        pgTime(row.backend_start) === witness.backendStart);
  });
}

export async function verifyBackendGone95({
  witness, readBackendRows, sleep = ms => new Promise(r => setTimeout(r, ms)),
  attempts = 12, pollMs = 125,
}) {
  assert(typeof readBackendRows === "function" &&
    Number.isSafeInteger(attempts) && attempts >= 2 && attempts <= 30,
  "KILLED95_BACKEND_DRAIN_READER_MISSING");
  let consecutive = 0;
  for (let n = 0; n < attempts; n++) {
    const rows = await readBackendRows(witness.backendPid, witness.applicationName);
    if (backendStillPresent95(rows, witness)) consecutive = 0;
    else if (++consecutive >= 2) {
      return { backendDrained: true, backendDrainSamples: n + 1,
        exactBackendGone: true, nonceSessionsGone: true };
    }
    if (n !== attempts - 1) await sleep(pollMs);
  }
  throw Error("KILLED95_BACKEND_STILL_PRESENT_UNKNOWN_QUARANTINE");
}

// Never release the held writer lock on a failed/unknown witness until this
// EXACT OWNED PostgreSQL instance is independently confirmed STOPPED.
export async function heldLockExitBarrier95({
  verifiedDrain, markUnknown, stopOwnedPg, releaseHeldLock,
}) {
  assert(typeof releaseHeldLock === "function", "KILLED95_RELEASE_CALLBACK_REQUIRED");
  if (verifiedDrain === true) {
    await releaseHeldLock();
    return "VERIFIED_DRAINED";
  }
  assert(typeof markUnknown === "function" &&
    typeof stopOwnedPg === "function", "KILLED95_QUARANTINE_CALLBACK_REQUIRED");
  let markerError = null;
  try { await markUnknown(); } catch (error) { markerError = error; }
  const stopped = await stopOwnedPg(); // stop runs BEFORE releasing writer lock
  assert(stopped === true, "KILLED95_PG_STOP_UNCONFIRMED_QUARANTINE_KEEP_LOCK");
  await releaseHeldLock();
  if (markerError) throw Error("KILLED95_QUARANTINE_MARKER_FAILED_UNKNOWN");
  return "UNKNOWN_QUARANTINED_PG_STOPPED";
}

export async function witnessAndKill95({
  child, appName, startedAtMs, readWaitRows, readBackendRows, exitPromise,
  sleep = ms => new Promise(r => setTimeout(r, ms)), polls = 23,
  pollMs = 180, exitTimeoutMs = 4000,
}) {
  assertChildLive(child);
  let witness = null;
  for (let n = 0; n < polls; n++) {
    assertChildLive(child);
    const rows = await readWaitRows(appName);
    // Ignore unrelated locks, but never let them become a positive witness.
    if (rows.length) {
      witness = confirmKilled95Wait(rows, { child, appName, startedAtMs });
      break;
    }
    if (n !== polls - 1) await sleep(pollMs);
  }
  assert(witness, "KILLED95_NO_CHILD_TAGGED_MIGRATION95_WAIT_REFUSE");
  assertChildLive(child);
  // Recheck a fresh PG read and the exact same backend before sending SIGKILL.
  const fresh = confirmKilled95Wait(await readWaitRows(appName),
    { child, appName, startedAtMs });
  assert(fresh.backendPid === witness.backendPid &&
    fresh.backendStart === witness.backendStart &&
    fresh.queryStart === witness.queryStart,
  "KILLED95_BACKEND_SWAPPED_BEFORE_KILL");
  assertChildLive(child);
  const accepted = child.kill("SIGKILL");
  assert(accepted === true, "KILLED95_SIGNAL_SEND_FAILED");
  let timer;
  try {
    const exit = await Promise.race([
      exitPromise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(
          Error("KILLED95_EXIT_UNOBSERVED_TIMEOUT")), exitTimeoutMs);
      }),
    ]);
    const death = confirmKilled95Death({ accepted, exit, witness: fresh });
    const gone = await verifyBackendGone95({
      witness: fresh, readBackendRows, sleep,
    });
    return { ...death, ...gone };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
