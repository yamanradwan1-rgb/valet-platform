// Read-only SQL reserved for a future authorized, independently leased PG17.
// Never records SQL text, client secrets, proof bytes, or customer identifiers.
export const BLOCKING_WITNESS_SQL = `
SELECT waiting.pid AS waiting_pid,
       pg_blocking_pids(waiting.pid) AS blocking_pids,
       waiting.wait_event_type,
       waiting.wait_event,
       w.locktype AS waiting_lock_type,
       w.mode AS waiting_lock_mode,
       w.database AS waiting_database,
       w.relation AS waiting_relation,
       w.page AS waiting_page,
       w.tuple AS waiting_tuple,
       w.transactionid::text AS waiting_xid,
       w.classid AS waiting_classid,
       w.objid AS waiting_objid,
       w.objsubid AS waiting_objsubid,
       held.pid AS holding_pid,
       held.mode AS holding_lock_mode,
       held.granted AS holding_granted
FROM pg_stat_activity waiting
JOIN pg_locks w ON w.pid = waiting.pid AND NOT w.granted
LEFT JOIN pg_locks held ON held.pid = $2::integer AND held.granted
 AND held.locktype = w.locktype
 AND held.database IS NOT DISTINCT FROM w.database
 AND held.relation IS NOT DISTINCT FROM w.relation
 AND held.page IS NOT DISTINCT FROM w.page
 AND held.tuple IS NOT DISTINCT FROM w.tuple
 AND held.virtualxid IS NOT DISTINCT FROM w.virtualxid
 AND held.transactionid IS NOT DISTINCT FROM w.transactionid
 AND held.classid IS NOT DISTINCT FROM w.classid
 AND held.objid IS NOT DISTINCT FROM w.objid
 AND held.objsubid IS NOT DISTINCT FROM w.objsubid
WHERE waiting.pid = $1::integer`;

export function validateBlockingWitness(rows, expected) {
  if (
    !Number.isInteger(expected?.waitingPid) ||
    !Number.isInteger(expected?.holdingPid) ||
    expected.waitingPid === expected.holdingPid ||
    typeof expected?.namedFence !== "string" ||
    !expected.namedFence
  ) {
    throw new Error("ISSUE416_RACE_BARRIER_TARGET_INVALID");
  }
  const physical = rows?.find(
    (row) =>
      row.waiting_pid === expected.waitingPid &&
      row.holding_pid === expected.holdingPid &&
      row.holding_granted === true &&
      row.wait_event_type === "Lock" &&
      Array.isArray(row.blocking_pids) &&
      row.blocking_pids.includes(expected.holdingPid) &&
      ["advisory", "transactionid", "tuple", "relation", "object"].includes(
        row.waiting_lock_type,
      ),
  );
  if (!physical)
    throw new Error("ISSUE416_RACE_PHYSICAL_LOCK_WAIT_NOT_OBSERVED");
  // This proves a matching physical lock resource only. Mapping that resource
  // to a named rank requires independent test-only statement instrumentation.
  return Object.freeze({
    observedPhysicalWait: true,
    waitingPid: expected.waitingPid,
    holdingPid: expected.holdingPid,
    namedFence: expected.namedFence,
    namedFenceVerified: false,
    pg17Acceptance: "NOT_RUN",
  });
}
