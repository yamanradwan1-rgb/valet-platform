import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { ShiftTestContext } from "./shift-test-context";

// The immutable T1 binary uses direct SQL quota DML. Only a freshly created
// fixture identity inherits the runtime reads and receives its historical
// counter writes on this one disposable database.
export class GuestT3LegacyCompatibilityFixture {
  readonly role = `vlt_t3_legacy_${randomBytes(10).toString("hex")}`;
  private readonly password = `legacy-${randomUUID()}`;
  private roleCreated = false;
  pool: Pool | undefined;

  constructor(private readonly context: ShiftTestContext) {}

  async setup(): Promise<Pool> {
    const admin = this.context.adminPool;
    await admin.query(
      `CREATE ROLE "${this.role}" WITH LOGIN PASSWORD '${this.password}'
       INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    this.roleCreated = true;
    try {
      await admin.query(
        `GRANT "${this.context.runtimeRole}" TO "${this.role}"
         WITH INHERIT TRUE, SET FALSE`,
      );
      await admin.query(
        `GRANT INSERT (scope,key_hash,state), UPDATE (state)
         ON TABLE public.anti_abuse_events TO "${this.role}"`,
      );
      const url = new URL(this.context.runtimeUrl);
      url.username = this.role;
      url.password = this.password;
      this.pool = new Pool({
        connectionString: url.toString(),
        max: 4,
        connectionTimeoutMillis: 2_000,
      });
      return this.pool;
    } catch (error) {
      await this.teardown();
      throw error;
    }
  }

  async teardown(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = undefined;
    }
    if (!this.roleCreated) return;
    const admin = this.context.adminPool;
    await admin.query(
      `REVOKE INSERT (scope,key_hash,state), UPDATE (state)
       ON TABLE public.anti_abuse_events FROM "${this.role}"`,
    );
    await admin.query(
      `REVOKE "${this.context.runtimeRole}" FROM "${this.role}"`,
    );
    await admin.query(`DROP ROLE "${this.role}"`);
    this.roleCreated = false;
  }
}
