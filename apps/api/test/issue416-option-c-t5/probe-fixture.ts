import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { ManagementControlPlaneTestFixture } from "../management-control-plane-test-fixture";
import { assertOwnedOptionCPg17 } from "./owned-target";

export type SqlAttempt =
  | {
      readonly allowed: true;
      readonly result: Record<string, unknown> | undefined;
    }
  | { readonly allowed: false; readonly sqlstate: string };

// 23505 represents the one-current-refresh-per-session guard when the older
// credential cannot be retired. Unknown SQLSTATE is always an infrastructure
// or malformed-probe failure and must never be interpreted as a secure denial.
const expectedDenialSqlstates = new Set([
  "42501",
  "23514",
  "23503",
  "23505",
  "P0001",
]);

export class OptionCT5Fixture extends ManagementControlPlaneTestFixture {
  private started = false;

  override async start(): Promise<void> {
    await assertOwnedOptionCPg17();
    try {
      await super.start();
      this.started = true;
    } catch (error) {
      // An interrupted migration/provision step must not strand a synthetic
      // role/database on the separately attested W37 container.
      await super.stop().catch(() => undefined);
      throw error;
    }
  }

  override async stop(): Promise<void> {
    if (this.started) {
      this.started = false;
      await super.stop();
    }
  }

  async runtimeSql(sql: string, args: unknown[] = []): Promise<SqlAttempt> {
    const connectionString = this.runtimeDatabaseUrl();
    const pool = new Pool({ connectionString, max: 1 });
    try {
      const attestedRole = await pool.query<{
        principal: string;
        login: string;
        superuser: boolean;
        bypass_rls: boolean;
        create_role: boolean;
      }>(`SELECT current_user AS principal, session_user AS login,
                role.rolsuper AS superuser, role.rolbypassrls AS bypass_rls,
                role.rolcreaterole AS create_role
         FROM pg_roles AS role WHERE role.rolname = current_user`);
      const identity = attestedRole.rows[0];
      const expectedPrincipal = new URL(connectionString).username;
      if (
        attestedRole.rowCount !== 1 ||
        identity?.principal !== expectedPrincipal ||
        identity.login !== expectedPrincipal ||
        identity.superuser ||
        identity.bypass_rls ||
        identity.create_role
      ) {
        throw new Error(
          "W37 T5 statement role is not the restricted runtime principal.",
        );
      }
      const result = await pool.query<Record<string, unknown>>(sql, args);
      return { allowed: true, result: result.rows[0] };
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (typeof code !== "string" || !expectedDenialSqlstates.has(code)) {
        throw new Error(
          `Unexpected T5 SQL result ${String(code ?? "UNKNOWN")}`,
        );
      }
      return { allowed: false, sqlstate: code };
    } finally {
      await pool.end();
    }
  }

  async admin(withTotp = false) {
    const user = await this.createUser();
    const membership = await this.createMembership(user.id);
    const auth = await this.nativeLogin(user);
    const assured = withTotp ? await this.enrollAndAssure(auth) : undefined;
    return { auth, assured, membership, user };
  }

  async employee(organizationId: string) {
    const user = await this.createUser();
    const membershipId = await this.addMembership(
      organizationId,
      user.id,
      "VALET_EMPLOYEE",
    );
    const location = await this.addLocation(organizationId);
    await this.query(
      `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
       VALUES($1,$2,$3)`,
      [organizationId, membershipId, location.locationId],
    );
    const auth = await this.nativeLogin(user);
    return { auth, location, membershipId, user };
  }
}

export const staffDirectoryPath = (organizationId: string) =>
  `/v1/staff/management/organizations/${organizationId}/staff`;

export const staffRolePath = (organizationId: string, membershipId: string) =>
  `${staffDirectoryPath(organizationId)}/${membershipId}/role`;

export const syntheticUuid = () => randomUUID();
