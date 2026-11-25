import { setTimeout as delay } from "node:timers/promises";
import type { Client, Pool } from "pg";

export async function dropFixtureDatabase(
  bootstrap: Pick<Client | Pool, "query">,
  databaseName: string,
): Promise<void> {
  const uuidFixture = /^(?:valet_(?:t1|guest)_[a-z0-9_]+|valet_staff_activation_(?:upgrade|fresh)|valet_mgt_fix02_(?:upgrade|fresh)|valet_issue416_audit|vlt_309_photo_scope)_[0-9a-f]{32}$/;
  const processFixture = /^(?:valet_(?:005a|005d|006a|008d)_role_\d+_\d+|valet_mgt_232_role_\d+_\d+|vlt_presence_\d+_[0-9a-f]{12})$/;
  if (!uuidFixture.test(databaseName) && !processFixture.test(databaseName)) {
    throw new Error("Refusing to drop a database outside the fixture namespace.");
  }
  // Closing a client can precede PostgreSQL processing its shutdown.
  const deadline = Date.now() + 2_000;
  for (;;) {
    try {
      await bootstrap.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      return;
    } catch (error) {
      if (typeof error !== "object" || error === null ||
          !("code" in error) || error.code !== "55006" || Date.now() >= deadline) throw error;
      await delay(40);
    }
  }
}
