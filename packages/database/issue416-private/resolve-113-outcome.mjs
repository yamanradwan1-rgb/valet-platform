// No SQL and no recovery policy authority. This supervisor observes the
// single official Prisma child and fences any outcome not proved on exit 0.
export const RECOVERY_OUTCOME = Object.freeze({
  NOT_EXECUTED: "NOT_EXECUTED",
  UNCHANGED_OBSERVED: "UNCHANGED_OBSERVED",
  COMMITTED_OBSERVED: "COMMITTED_OBSERVED",
  UNKNOWN: "UNKNOWN",
});

// A snapshot must come from the separately preflighted READ ONLY connection,
// never from the Prisma child or its exit text. Even a matching snapshot after
// timeout cannot exclude a later child/external commit: keep the lease held.
export async function observeRecovery113({
  snapshot,
  assertCommitted,
  assertUnchanged,
}) {
  try {
    const current = await snapshot();
    try {
      assertCommitted(current);
      return RECOVERY_OUTCOME.COMMITTED_OBSERVED;
    } catch {
      // Try the exact unchanged baseline, not an inferred "no execution".
    }
    try {
      assertUnchanged(current);
      return RECOVERY_OUTCOME.UNCHANGED_OBSERVED;
    } catch {
      return RECOVERY_OUTCOME.UNKNOWN;
    }
  } catch {
    return RECOVERY_OUTCOME.UNKNOWN;
  }
}

// "arm" fsyncs a small, nonsecret marker BEFORE the child could start.
// If arming fails, retain the lease conservatively (partial marker risk).
// A failed child always fails this function, including COMMITTED_OBSERVED.
// Never retry, unlock, execute SQL, or interpret Prisma's stdout/stderr.
export async function superviseRecovery113({
  prepare,
  arm,
  invokeOfficialChild,
  observe,
  record,
  release,
}) {
  let possibleDispatch = false;
  let verifiedSuccess = false;
  try {
    try {
      await prepare(); // Child not dispatched: NOT_EXECUTED by this call.
    } catch {
      throw new Error(
        "Issue416 W9 recovery NOT_EXECUTED: pre-child guard refused.",
      );
    }
    possibleDispatch = true;
    await arm();
    let childFailed = false;
    try {
      await invokeOfficialChild();
    } catch {
      childFailed = true; // Includes timeout, spawn error and nonzero exit.
    }
    let observed = RECOVERY_OUTCOME.UNKNOWN;
    try {
      observed = await observe();
    } catch {
      // A broken independent read cannot be used to clear the lease.
    }
    await record(observed, childFailed);
    if (childFailed || observed !== RECOVERY_OUTCOME.COMMITTED_OBSERVED) {
      throw new Error(
        `Issue416 W9 recovery requires independent read-only review: ${observed}.`,
      );
    }
    verifiedSuccess = true;
    return RECOVERY_OUTCOME.COMMITTED_OBSERVED;
  } finally {
    // Only proven pre-child failures and normal child exit plus exact verified
    // postcondition may remove this invocation's cooperating fixture lease.
    // All child errors, failed postconditions and uncertain commits retain it.
    if (!possibleDispatch || verifiedSuccess) await release();
  }
}
