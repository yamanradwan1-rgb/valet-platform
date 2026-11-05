/**
 * Tracks an owned OS process from spawn, including a child that never becomes
 * ready. Only 'close' confirms exit and drained child pipes; SIGTERM alone is
 * not evidence of process termination.
 */
export function trackIssue429OwnedChild(child, deadlineMs = 8_000) {
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1) {
    throw new Error("Invalid owned-child exit confirmation deadline.");
  }
  let closed = false;
  let resolveClose;
  const closedEvent = new Promise((resolve) => {
    resolveClose = resolve;
  });
  child.once("close", () => {
    closed = true;
    resolveClose();
  });
  // Spawn errors must not escape as unhandled events. Close still has to occur.
  child.on("error", () => {});
  let pending;
  async function terminateAndConfirm() {
    if (closed) return;
    if (pending) return pending;
    pending = (async () => {
      let timeout;
      try {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill();
        }
        await Promise.race([
          closedEvent,
          new Promise((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error("Owned API child OS exit unconfirmed.")),
              deadlineMs,
            );
          }),
        ]);
        if (!closed) throw new Error("Owned API child close event missing.");
      } finally {
        clearTimeout(timeout);
      }
    })();
    try {
      return await pending;
    } finally {
      pending = undefined;
    }
  }
  return {
    pid: child.pid,
    exitConfirmed: () => closed,
    close: terminateAndConfirm,
  };
}

/**
 * Register the handle before probing readiness so a failing startup can never
 * evade the caller's final child-exit/lease fence.
 */
export async function startIssue429TrackedChild(
  child,
  awaitReady,
  register,
  deadlineMs,
) {
  const owner = trackIssue429OwnedChild(child, deadlineMs);
  try {
    register(owner);
    await awaitReady();
    if (owner.exitConfirmed()) {
      throw new Error("Owned API exited during readiness.");
    }
    return owner;
  } catch (error) {
    try {
      await owner.close();
    } catch {
      throw new Error(
        "Owned API startup failed with unconfirmed process exit; retain exclusive PG lease.",
      );
    }
    throw error;
  }
}

/** Never relinquish the shared database lease while any API exit is uncertain. */
export async function releaseIssue429LeaseAfterChildExits(
  lease,
  owners,
  cleanupErrors = [],
) {
  if (cleanupErrors.length !== 0) {
    throw new Error(
      "Owned QA resource cleanup incomplete: exclusive PG lease retained.",
    );
  }
  if (!owners.every((owner) => owner.exitConfirmed())) {
    throw new Error(
      "Unconfirmed API OS exit: exclusive PostgreSQL lease retained.",
    );
  }
  await lease.release();
}

/**
 * Runtime source must remain present if a spawned child may still be executing
 * it or if the owning PostgreSQL lease was deliberately retained. Pre-lease
 * failures have no child/lease and can safely remove their unused snapshot.
 */
export function mayReleaseIssue429RuntimeSnapshot(state) {
  return (
    state.leaseAcquired !== true ||
    (state.leaseReleased === true &&
      state.allChildExitsConfirmed === true &&
      Array.isArray(state.cleanupErrors) &&
      state.cleanupErrors.length === 0)
  );
}
