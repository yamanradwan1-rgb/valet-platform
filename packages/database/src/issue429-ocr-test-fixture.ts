import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

import {
  provisionOcrPrincipal,
  verifyOcrPrincipal,
} from "../scripts/ocr-principal-privileges.mjs";
import { verifyOcrRuntimePrivileges } from "../scripts/ocr-runtime-privileges.mjs";
import { Issue429OcrOwnedTarget } from "./issue429-ocr-owned-target.js";

export interface OcrScope {
  organizationId: string;
  membershipId: string;
  locationId: string;
  sessionId: string;
}

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);

export class Issue429OcrFixture {
  readonly target = new Issue429OcrOwnedTarget();
  url = "";
  admin!: Client;
  runtime!: Client;
  maintenance!: Client;
  operator!: Client;
  runtimeRole = "";
  maintenanceRole = "";
  operatorRole = "";
  accountAlias = `ocrqa_${randomUUID().slice(0, 8)}`;
  periodId = "";
  private operatorCapabilityCreated = false;
  private readonly passwords = {
    runtime: randomUUID(), maintenance: randomUUID(), operator: randomUUID(),
  };

  private roleUrl(role: string, password: string): string {
    const url = new URL(this.url);
    url.username = role;
    url.password = password;
    return url.toString();
  }

  private runScript(args: string[], runtimeUrl?: string): void {
    execFileSync(process.execPath, args, {
      cwd: packageRoot,
      env: {
        ...process.env, NODE_ENV: "test",
        MIGRATION_DATABASE_URL: this.url,
        DATABASE_URL: runtimeUrl,
      },
      stdio: "pipe",
      timeout: 120000,
      windowsHide: true,
    });
  }

  private async formatted(
    client: Client, format: string, values: string[],
  ): Promise<void> {
    const params = values.map((_, i) => `$${i + 2}::text`).join(",");
    const result = await client.query<{ sql: string }>(
      `SELECT format($1,${params}) AS sql`, [format, ...values],
    );
    if (!result.rows[0]?.sql) throw new Error("OCR privileged SQL format failed.");
    await client.query(result.rows[0].sql);
  }

  async start(): Promise<void> {
    this.url = await this.target.createDatabase();
    this.runScript([prismaCli, "migrate", "deploy"]);
    this.admin = new Client({ connectionString: this.url });
    await this.admin.connect();
    const existing = await this.admin.query(
      "SELECT 1 FROM pg_roles WHERE rolname='vaylet_ocr_operator'",
    );
    if (existing.rowCount !== 0) {
      throw new Error("OCR operator capability already exists; no shared test role reuse.");
    }
    this.runtimeRole = await this.target.createRole(this.passwords.runtime);
    this.maintenanceRole = await this.target.createRole(this.passwords.maintenance);
    this.operatorRole = await this.target.createRole(this.passwords.operator);
    const runtimeUrl = this.roleUrl(this.runtimeRole, this.passwords.runtime);
    this.runScript(["scripts/provision-runtime-role.mjs"], runtimeUrl);
    const database = new URL(this.url).pathname.slice(1);
    await this.admin.query("BEGIN");
    try {
      const format = this.formatted.bind(this);
      await provisionOcrPrincipal(
        this.admin, (c: Client, f: string, a: string[]) => format(c, f, a),
        "maintenance", this.maintenanceRole, database,
      );
      await provisionOcrPrincipal(
        this.admin, (c: Client, f: string, a: string[]) => format(c, f, a),
        "operator", this.operatorRole, database,
      );
      await this.admin.query("COMMIT");
      this.operatorCapabilityCreated = true;
    } catch (error) {
      await this.admin.query("ROLLBACK");
      throw error;
    }
    await verifyOcrRuntimePrivileges(this.admin, this.runtimeRole);
    await verifyOcrPrincipal(this.admin, "operator", this.operatorRole);
    await verifyOcrPrincipal(this.admin, "maintenance", this.maintenanceRole);
    this.runtime = new Client({ connectionString: runtimeUrl });
    this.operator = new Client({
      connectionString: this.roleUrl(this.operatorRole, this.passwords.operator),
    });
    this.maintenance = new Client({
      connectionString: this.roleUrl(this.maintenanceRole, this.passwords.maintenance),
    });
    await this.runtime.connect();
    await this.operator.connect();
    await this.maintenance.connect();
  }

  async seedScope(accessMillis = 60_000): Promise<OcrScope> {
    const organizationId = randomUUID();
    const membershipId = randomUUID();
    const locationId = randomUUID();
    const sessionId = randomUUID();
    const userId = randomUUID();
    const email = `${userId}@issue429.test.invalid`;
    await this.admin.query(`
      INSERT INTO organizations(id,name,status,timezone,ocr_assist_enabled,updated_at)
      VALUES($1,'Issue429 OCR test','ACTIVE','Asia/Amman',TRUE,clock_timestamp())`,
      [organizationId]);
    await this.admin.query(`
      INSERT INTO users(id,email,password_hash,status,updated_at)
      VALUES($1,$2,'synthetic-test-only','ACTIVE',clock_timestamp())`,
      [userId, email]);
    await this.admin.query(`
      INSERT INTO organization_memberships
        (id,organization_id,user_id,role,status,updated_at)
      VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',clock_timestamp())`,
      [membershipId, organizationId, userId]);
    await this.admin.query(`
      INSERT INTO locations
        (id,organization_id,name,code,address_text,timezone,currency,
         status,accepting_intake,updated_at)
      VALUES($1,$2,'OCR Test',$3,'Synthetic','Asia/Amman','JOD',
        'ACTIVE',TRUE,clock_timestamp())`,
      [locationId, organizationId, randomUUID()]);
    await this.admin.query(`
      INSERT INTO membership_location_access
        (organization_id,membership_id,location_id) VALUES($1,$2,$3)`,
      [organizationId, membershipId, locationId]);
    await this.admin.query(`
      INSERT INTO shifts(id,organization_id,membership_id,location_id,status,started_at)
      VALUES($1,$2,$3,$4,'ACTIVE',clock_timestamp()-interval '1 minute')`,
      [randomUUID(),organizationId,membershipId,locationId]);
    await this.admin.query(`
      INSERT INTO staff_auth_sessions(
        id,user_id,current_access_token_hash,created_at,last_rotated_at,
        access_expires_at,absolute_expires_at)
      VALUES($1,$2,$3,clock_timestamp()-interval '1 minute',
             clock_timestamp()-interval '1 minute',
             clock_timestamp()+($4::integer*interval '1 millisecond'),
             clock_timestamp()+interval '2 hours')`,
      [sessionId, userId,
        `staff-access-sha256:v1:${randomUUID().replaceAll("-", "").repeat(2)}`,
        accessMillis]);
    return { organizationId, membershipId, locationId, sessionId };
  }

  async provision(scope: OcrScope, quota = 12): Promise<void> {
    const op = this.operator;
    await op.query(
      "SELECT ocr_operator_set_platform($1,1,FALSE,$2,2,'QA_SETUP',NULL)",
      [randomUUID(), this.accountAlias]);
    const period = await op.query<{ id: string }>(`
      SELECT ocr_operator_provision_period($1,$2,
        clock_timestamp()-interval '1 minute',
        clock_timestamp()+interval '1 hour',$3,'QA_SETUP',NULL) AS id`,
      [randomUUID(), this.accountAlias, quota]);
    this.periodId = period.rows[0]!.id;
    await op.query(
      "SELECT ocr_operator_set_org($1,$2,0,TRUE,2,'QA_SETUP',NULL)",
      [randomUUID(), scope.organizationId]);
    await op.query(
      "SELECT ocr_operator_allocate($1,$2,$3,0,$4,'QA_SETUP',NULL)",
      [randomUUID(), this.periodId, scope.organizationId, quota]);
    await op.query(
      "SELECT ocr_operator_activate_period($1,2,$2,'QA_SETUP',NULL)",
      [randomUUID(), this.periodId]);
    await op.query(
      "SELECT ocr_operator_set_platform($1,3,TRUE,$2,2,'QA_SETUP',NULL)",
      [randomUUID(), this.accountAlias]);
  }

  async close(): Promise<void> {
    for (const client of [this.runtime,this.operator,this.maintenance,this.admin]) {
      await client?.end().catch(() => {});
    }
    await this.target.close();
    if (this.operatorCapabilityCreated) await this.target.dropOperatorCapability();
  }
}
