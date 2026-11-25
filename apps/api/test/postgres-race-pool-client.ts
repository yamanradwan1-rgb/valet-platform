import type { PoolClient } from "pg";

// A failed transaction-control query leaves the connection's state uncertain.
// Never recycle it, and never attempt a second release after close starts.
export function racePoolTransaction(client: PoolClient) {
  let closed = false;
  return {
    async close(outcome: "COMMIT" | "ROLLBACK") {
      if (closed) return;
      closed = true;
      try {
        await client.query(outcome);
      } catch (error) {
        try {
          client.release(true);
        } catch {
          // Preserve the failed PostgreSQL command as the primary error.
        }
        throw error;
      }
      client.release();
    },
  };
}
