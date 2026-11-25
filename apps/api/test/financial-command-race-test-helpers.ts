import type { PoolClient } from "pg";

// Retain every competing operation until its transaction has settled, even
// when observing the intended causal lock edge fails.
export function settled<T>(
  pending: Promise<unknown>[],
  operation: Promise<T>,
) {
  const result = operation.then(
    (value) => ({ kind: "FULFILLED" as const, value }),
    (error: unknown) => ({ error, kind: "REJECTED" as const }),
  );
  pending.push(result);
  return result;
}

export async function rollbackAndDrain(
  blocker: PoolClient,
  pending: Promise<unknown>[],
) {
  try {
    await blocker.query("ROLLBACK");
  } finally {
    blocker.release();
    await Promise.allSettled(pending);
  }
}
