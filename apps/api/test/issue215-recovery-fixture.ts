import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Client, Pool } from "pg";

import { createRuntimePostgresPool } from "../src/common/database/postgres";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import {
  recoveryDatabaseIsExplicitlyOwned,
  requireIssue215TestUrl,
  verifyIssue215Bootstrap,
} from "./issue215-recovery-target";
export { recoveryDatabaseIsExplicitlyOwned } from "./issue215-recovery-target";

const suffix = randomBytes(5).toString("hex");
const databaseName = `valet_215_rec_${suffix}`;
const runtimeRole = `valet_215_rec_role_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;

export interface RecoveryFixture {
  readonly userId: string;
  readonly membershipId: string;
  readonly sessionId: string;
  readonly credential: StaffSessionContext;
}

export class Issue215RecoveryDatabase {
  private readonly root = resolve(process.cwd(), "../..");
  private readonly bootstrapUrl: string;
  private readonly adminUrl: string;
  readonly runtimeUrl: string;
  readonly adminPool: Pool;
  readonly runtimePool: Pool;
  private createdDatabase = false;

  constructor() {
    if (!recoveryDatabaseIsExplicitlyOwned())
      throw new Error("Issue 215 recovery database ownership is unconfirmed.");
    this.bootstrapUrl = requireIssue215TestUrl(process.env);
    const base = new URL(this.bootstrapUrl);
    base.pathname = `/${databaseName}`;
    this.adminUrl = base.toString();
    this.adminPool = new Pool({ connectionString: this.adminUrl });
    base.username = runtimeRole;
    base.password = runtimePassword;
    this.runtimeUrl = base.toString();
    this.runtimePool = createRuntimePostgresPool(this.runtimeUrl);
  }

  /** Fresh Docker ID, volume, live role and database attestation per lifecycle. */
  private async withVerifiedBootstrap<T>(
    action: (admin: Client) => Promise<T>,
  ): Promise<T> {
    if (requireIssue215TestUrl(process.env) !== this.bootstrapUrl)
      throw new Error("Issue 215 bootstrap target changed.");
    const client = new Client({ connectionString: this.bootstrapUrl });
    try {
      await client.connect();
      await verifyIssue215Bootstrap(client);
      return await action(client);
    } finally {
      try { await client.end(); }
      catch { /* Never substitute a teardown failure for failed attestation. */ }
    }
  }

  private async pnpm(args: string[], runtime: boolean): Promise<void> {
    const executable = process.env.npm_execpath;
    const command = executable ? process.execPath : process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const params = executable ? [executable, ...args] : args;
    const env: NodeJS.ProcessEnv = {
      ...process.env, NODE_ENV: "test", MIGRATION_DATABASE_URL: this.adminUrl,
    };
    delete env.DATABASE_URL;
    if (runtime) env.DATABASE_URL = this.runtimeUrl;
    await new Promise<void>((ok, fail) => {
      const child = spawn(command, params, {
        cwd: this.root, env, windowsHide: true,
        shell: !executable && process.platform === "win32",
      });
      let output = "";
      child.stdout?.on("data", (part: Buffer) => { output += part.toString(); });
      child.stderr?.on("data", (part: Buffer) => { output += part.toString(); });
      child.once("error", fail);
      child.once("close", (code) => code === 0 ? ok() :
        fail(new Error(`Issue 215 test fixture provisioning failed: exit ${String(code)}; ${output.replaceAll(this.adminUrl, "[DB]").replaceAll(this.runtimeUrl, "[DB]")}`)));
    });
  }

  async start(): Promise<void> {
    await this.withVerifiedBootstrap(async (admin) => {
      const existing = await admin.query(
        "SELECT 1 FROM pg_database WHERE datname=$1", [databaseName],
      );
      if (existing.rowCount !== 0)
        throw new Error("Generated Issue 215 database already exists.");
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      this.createdDatabase = true;
    });
    await this.pnpm(["--filter", "@valet/database", "migrate:deploy"], false);
    await this.pnpm(["--filter", "@valet/database", "runtime:provision"], true);
  }

  async close(): Promise<void> {
    await this.runtimePool.end();
    await this.adminPool.end();
    if (!this.createdDatabase) return;
    await this.withVerifiedBootstrap(async (admin) => {
      const database = await admin.query<{ owner: string }>(
        `SELECT owner.rolname AS owner FROM pg_database database
         JOIN pg_roles owner ON owner.oid = database.datdba
         WHERE database.datname=$1`, [databaseName],
      );
      if (database.rows.length !== 1 || database.rows[0]?.owner !== "issue215_owner")
        throw new Error("Issue 215 test database owner changed; refusing DROP.");
      await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
      this.createdDatabase = false;
      const role = await admin.query<{
        can_login: boolean; can_create_db: boolean; can_create_role: boolean;
      }>(
        `SELECT rolcanlogin AS can_login, rolcreatedb AS can_create_db,
                rolcreaterole AS can_create_role
         FROM pg_roles WHERE rolname=$1`, [runtimeRole],
      );
      if (role.rowCount === 0) return;
      if (role.rows.length !== 1 || role.rows[0]?.can_login !== true ||
          role.rows[0]?.can_create_db !== false ||
          role.rows[0]?.can_create_role !== false)
        throw new Error("Issue 215 runtime role privileges changed; refusing DROP.");
      await admin.query(`DROP ROLE "${runtimeRole}"`);
    });
  }

  async newCredential(userId: string): Promise<StaffSessionContext> {
    const authSessionId = randomUUID();
    const accessTokenHash = `staff-access-sha256:v1:${randomBytes(32).toString("hex")}`;
    const result = await this.adminPool.query<{ created_at: Date }>(
      `INSERT INTO staff_auth_sessions
        (id,user_id,current_access_token_hash,access_expires_at,absolute_expires_at,
         created_at,last_rotated_at)
       VALUES ($1,$2,$3,clock_timestamp()+interval '15 minutes',
               clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())
       RETURNING created_at`,
      [authSessionId, userId, accessTokenHash],
    );
    return { userId, staffAuthSessionId: authSessionId,
      accessTokenHash, createdAt: result.rows[0]!.created_at };
  }

  async fixture(): Promise<RecoveryFixture> {
    const organizationId = randomUUID();
    const locationId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();
    const vehicleId = randomUUID();
    const sessionId = randomUUID();
    const unique = randomUUID();
    const client = await this.adminPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO organizations
          (id,name,status,timezone,check_in_photos_required,updated_at)
         VALUES ($1,$2,'ACTIVE','Asia/Amman',true,clock_timestamp())`,
        [organizationId, `recovery-${unique}`],
      );
      await client.query(
        `INSERT INTO locations
          (id,organization_id,name,code,address_text,timezone,currency,status,accepting_intake,updated_at)
         VALUES ($1,$2,'Recovery fixture',$3,'Test only','Asia/Amman','JOD','ACTIVE',true,clock_timestamp())`,
        [locationId, organizationId, unique],
      );
      await client.query(
        `INSERT INTO users (id,email,password_hash,status,updated_at)
         VALUES ($1,$2,'test-only','ACTIVE',clock_timestamp())`,
        [userId, `${unique}@recovery.test`],
      );
      await client.query(
        `INSERT INTO organization_memberships
          (id,organization_id,user_id,role,status,updated_at)
         VALUES ($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',clock_timestamp())`,
        [membershipId, organizationId, userId],
      );
      await client.query(
        `INSERT INTO membership_location_access
          (organization_id,membership_id,location_id) VALUES ($1,$2,$3)`,
        [organizationId, membershipId, locationId],
      );
      await client.query(
        `INSERT INTO vehicles (id,organization_id,temporary_descriptor,updated_at)
         VALUES ($1,$2,'Recovery test vehicle',clock_timestamp())`,
        [vehicleId, organizationId],
      );
      await client.query(
        `INSERT INTO valet_sessions
          (id,customer_access_token_hash,customer_access_expires_at,
           customer_access_revoked_at,organization_id,location_id,vehicle_id,
           state,checked_in_by_membership_id,version,updated_at)
         VALUES ($1,$2,clock_timestamp(),clock_timestamp(),$3,$4,$5,
                 'CHECKING_IN',$6,1,clock_timestamp())`,
        [sessionId, `disabled:recovery:${randomBytes(32).toString("hex")}`,
          organizationId, locationId, vehicleId, membershipId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return { userId, membershipId, sessionId,
      credential: await this.newCredential(userId) };
  }
}
