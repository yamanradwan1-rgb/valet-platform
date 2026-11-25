import type { Pool } from "pg";
import { createManagementWriterPool } from "../src/modules/management/management-writer-database.module";
import { ciFixtureManagementWriterEnvironment } from "./staff-auth-native-test-environment";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";

/** Only contention suites that execute the protected Management writer
 * commands own the extra pool. Ordinary Presence fixtures retain their
 * original resource profile and do not depend on this writer lifecycle.
 */
export class PresenceProtectedWriterTestContext extends PresenceServerTestContext {
  private protectedWriterPool: Pool | undefined;

  managementWriterPool(): Pool {
    if (this.protectedWriterPool !== undefined) return this.protectedWriterPool;
    const supplied =
      ciFixtureManagementWriterEnvironment(this.runtimeUrl)
        .MANAGEMENT_WRITER_DATABASE_URL ??
      process.env.MANAGEMENT_WRITER_DATABASE_URL;
    if (supplied === undefined) {
      throw new Error("Presence race fixture requires dedicated Management writer credentials.");
    }
    const target = new URL(supplied);
    target.pathname = new URL(this.runtimeUrl).pathname;
    this.protectedWriterPool = createManagementWriterPool({
      ...process.env,
      DATABASE_URL: this.runtimeUrl,
      MIGRATION_DATABASE_URL: this.migrationUrl,
      MANAGEMENT_WRITER_DATABASE_URL: target.toString(),
      NODE_ENV: "test",
    });
    return this.protectedWriterPool;
  }

  override async teardown() {
    try {
      await this.protectedWriterPool?.end();
    } finally {
      await super.teardown();
    }
  }
}
