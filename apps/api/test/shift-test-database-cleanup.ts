import { setTimeout as delay } from "node:timers/promises";
import type { Pool } from "pg";

export async function dropShiftFixtureDatabase(bootstrap: Pool, databaseName: string): Promise<void> {
  if (!/^vlt_005b_[a-z0-9_]+$/.test(databaseName)) {
    throw new Error("Refusing to drop a database outside the Shift fixture namespace.");
  }

  // pg.Pool.end can finish before PostgreSQL consumes the last connection's
  // shutdown. A restricted fixture owner must never force-close another role.
  const deadline = Date.now() + 2_000;
  for (;;) {
    try {
      await bootstrap.query(`DROP DATABASE "${databaseName}"`);
      return;
    } catch (error) {
      if (typeof error !== "object" || error === null ||
          !("code" in error) || error.code !== "55006" || Date.now() >= deadline) throw error;
      await delay(40);
    }
  }
}
