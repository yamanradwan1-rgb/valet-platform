import type { PostgresPool, PostgresTransaction } from "../../common/database/postgres";
import {
  beginTransactionOutcomes,
  finishTransactionOutcomes,
} from "../../common/database/postgres-transaction-outcome";

const checkoutQueues = new WeakMap<PostgresPool, Promise<void>>();

/** Keep four simultaneous photo readers from each retaining one of four leases. */
async function checkoutPair(pool: PostgresPool): Promise<{
  readonly witness: PostgresTransaction;
  readonly ack: PostgresTransaction;
}> {
  const previous = checkoutQueues.get(pool) ?? Promise.resolve();
  let finish!: () => void;
  const mine = new Promise<void>((resolve) => { finish = resolve; });
  checkoutQueues.set(pool,previous.then(() => mine));
  await previous;
  try {
    const witness = await pool.connect();
    try {
      const ack = await pool.connect();
      return { witness, ack };
    } catch (error) {
      witness.release();
      throw error;
    }
  } finally {
    finish();
  }
}

/**
 * Two independently authenticated READ COMMITTED transactions check every
 * canonical scope/evidence row. The witness holds SHARE locks across the
 * second transaction's acknowledged COMMIT and through the HTTP enqueue.
 * Both leases are acquired BEFORE either transaction starts, so simultaneous
 * photo requests cannot starve one another while holding database row locks.
 * No S3/network I/O or HTTP flush is awaited under either transaction.
 *
 * The witness deliberately ROLLBACKs: it performs no writes, and preserves
 * the canonical row locks across the separately acknowledged commit. A failed
 * witness cleanup causes its connection to be destroyed, releasing all locks.
 */
export async function withCommittedPhotoDeliveryFence(
  pool: PostgresPool,
  revalidate: (witness: PostgresTransaction) => Promise<void>,
  enqueueSync: () => void,
): Promise<void> {
  const { witness, ack } = await checkoutPair(pool);
  let witnessStarted = false;
  let witnessBeginAttempted = false;
  let ackStarted = false;
  let ackBeginAttempted = false;
  let committing = false;
  let witnessUnusable = false;
  let ackUnusable = false;
  try {
    // Both leases are already pinned; no transaction holds one while waiting
    // to acquire its partner from a saturated runtime pool.
    witnessBeginAttempted = true;
    await witness.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    witnessStarted = true;
    beginTransactionOutcomes(witness);
    await revalidate(witness);

    ackBeginAttempted = true;
    await ack.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    ackStarted = true;
    beginTransactionOutcomes(ack);
    // If an EXCLUSIVE writer queued after B acquired SHARE, it has priority
    // before A's next SHARE. Waiting indefinitely would deadlock the app:
    // writer awaits B and A awaits writer. Abort A promptly and release B.
    await ack.query("SET LOCAL lock_timeout = '300ms'");
    await revalidate(ack);
    committing = true;
    await ack.query("COMMIT");
    ackStarted = false;
    finishTransactionOutcomes(ack, "COMMITTED");

    // Confirm that B's session remains alive and holds its row locks, even if
    // A committed while B's underlying connection was lost unexpectedly.
    const alive = await witness.query<{ alive: number }>("SELECT 1 AS alive");
    if (alive.rows[0]?.alive !== 1) throw new Error("Photo evidence witness lost.");
    // Response.end is synchronous; no additional I/O before enqueue.
    enqueueSync();
  } catch (error) {
    if (committing || (ackBeginAttempted && !ackStarted)) ackUnusable = true;
    if (witnessBeginAttempted && !witnessStarted) witnessUnusable = true;
    throw error;
  } finally {
    if (witnessStarted) {
      try {
        await witness.query("ROLLBACK");
        witnessStarted = false;
        finishTransactionOutcomes(witness, "ROLLED_BACK");
      } catch {
        witnessUnusable = true;
        finishTransactionOutcomes(witness, "UNAVAILABLE");
      }
    }
    if (ackStarted && !committing) {
      try {
        await ack.query("ROLLBACK");
        ackStarted = false;
        finishTransactionOutcomes(ack, "ROLLED_BACK");
      } catch {
        ackUnusable = true;
        finishTransactionOutcomes(ack, "UNAVAILABLE");
      }
    }
    if (ackStarted) {
      ackUnusable = true;
      finishTransactionOutcomes(ack, "UNAVAILABLE");
    }
    ack.release(ackUnusable);
    witness.release(witnessUnusable || witnessStarted);
  }
}
