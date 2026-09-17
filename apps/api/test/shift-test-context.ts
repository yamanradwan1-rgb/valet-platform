import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { Pool } from "pg";

import { createRuntimePostgresPool } from "../src/common/database/postgres";

export type TestRole =
  "LOCATION_MANAGER" | "ORG_ADMIN" | "VALET_EMPLOYEE" | "VALET_SUPERVISOR";

export interface ShiftFixture {
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly userId: string;
}

export interface ShiftFixtureOptions {
  readonly locationAccess?: boolean;
  readonly locationStatus?: "ACTIVE" | "INACTIVE";
  readonly membershipStatus?: "ACTIVE" | "INACTIVE";
  readonly organizationStatus?: "ACTIVE" | "INACTIVE";
  readonly role?: TestRole;
  readonly userStatus?: "ACTIVE" | "DISABLED";
}

const baseDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const repositoryRoot = resolve(process.cwd(), "../..");
const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function targetUrl(databaseName: string): string {
  const url = new URL(baseDatabaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function runPnpm(args: string[], environment: NodeJS.ProcessEnv) {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath === undefined ? pnpmExecutable : process.execPath;
  const commandArgs = npmExecPath === undefined ? args : [npmExecPath, ...args];
  const childEnvironment = { ...process.env, ...environment };
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: repositoryRoot,
      env: childEnvironment,
      shell: npmExecPath === undefined && process.platform === "win32",
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else
        reject(
          new Error(
            `Database setup command failed (${String(code)}). ${output}`,
          ),
        );
    });
  });
}

export class ShiftTestContext {
  readonly adminPool: Pool;
  readonly databaseName: string;
  readonly migrationUrl: string;
  readonly runtimePassword = `runtime-${randomUUID()}`;
  readonly runtimeRole: string;
  readonly runtimeUrl: string;
  runtimePool!: Pool;

  constructor(label: string) {
    const labelKey = createHash("sha256")
      .update(label)
      .digest("hex")
      .slice(0, 10);
    const suffix = `${process.pid.toString(36)}_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
    this.databaseName = `vlt_005b_${labelKey}_${suffix}`;
    this.runtimeRole = `vlt_005b_${labelKey}_role_${suffix}`;
    this.migrationUrl = targetUrl(this.databaseName);
    const runtimeUrl = new URL(this.migrationUrl);
    runtimeUrl.username = this.runtimeRole;
    runtimeUrl.password = this.runtimePassword;
    this.runtimeUrl = runtimeUrl.toString();
    this.adminPool = new Pool({ connectionString: this.migrationUrl });
  }

  async setup(): Promise<void> {
    const bootstrap = new Pool({ connectionString: baseDatabaseUrl });
    try {
      await bootstrap.query(`CREATE DATABASE "${this.databaseName}"`);
    } finally {
      await bootstrap.end();
    }
    await runPnpm(["--filter", "@valet/database", "migrate:deploy"], {
      MIGRATION_DATABASE_URL: this.migrationUrl,
      NODE_ENV: "test",
    });
    await runPnpm(["--filter", "@valet/database", "runtime:provision"], {
      DATABASE_URL: this.runtimeUrl,
      MIGRATION_DATABASE_URL: this.migrationUrl,
      NODE_ENV: "test",
    });
    this.runtimePool = createRuntimePostgresPool(this.runtimeUrl);
  }

  async teardown(): Promise<void> {
    await this.runtimePool?.end();
    await this.adminPool.end();
    const bootstrap = new Pool({ connectionString: baseDatabaseUrl });
    try {
      await bootstrap.query(
        `DROP DATABASE "${this.databaseName}" WITH (FORCE)`,
      );
      await bootstrap.query(`DROP ROLE IF EXISTS "${this.runtimeRole}"`);
    } finally {
      await bootstrap.end();
    }
  }

  async createFixture(
    options: ShiftFixtureOptions = {},
    existingUserId?: string,
  ): Promise<ShiftFixture> {
    const identity = randomUUID();
    const fixture = {
      locationId: randomUUID(),
      membershipId: randomUUID(),
      organizationId: randomUUID(),
      userId: existingUserId ?? randomUUID(),
    };
    await this.adminPool.query(
      `INSERT INTO organizations
         (id, name, status, timezone, updated_at)
       VALUES ($1, $2, $3, 'Asia/Amman', transaction_timestamp())`,
      [
        fixture.organizationId,
        `VAL-005B ${identity}`,
        options.organizationStatus ?? "ACTIVE",
      ],
    );
    await this.adminPool.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          status, accepting_intake, updated_at)
       VALUES ($1, $2, 'Shift location', $3, 'Address', 'Asia/Amman',
               'JOD', $4, $5, transaction_timestamp())`,
      [
        fixture.locationId,
        fixture.organizationId,
        identity,
        options.locationStatus ?? "ACTIVE",
        (options.locationStatus ?? "ACTIVE") === "ACTIVE",
      ],
    );
    if (existingUserId === undefined) {
      await this.adminPool.query(
        `INSERT INTO users
           (id, email, password_hash, status, updated_at)
         VALUES ($1, $2, 'not-a-real-password-hash', $3,
                 transaction_timestamp())`,
        [
          fixture.userId,
          `${identity}@val-005b.test`,
          options.userStatus ?? "ACTIVE",
        ],
      );
    }
    await this.adminPool.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, transaction_timestamp())`,
      [
        fixture.membershipId,
        fixture.organizationId,
        fixture.userId,
        options.role ?? "VALET_EMPLOYEE",
        options.membershipStatus ?? "ACTIVE",
      ],
    );
    if (options.locationAccess !== false) {
      await this.adminPool.query(
        `INSERT INTO membership_location_access
           (organization_id, membership_id, location_id)
         VALUES ($1, $2, $3)`,
        [fixture.organizationId, fixture.membershipId, fixture.locationId],
      );
    }
    return fixture;
  }

  async addLocation(fixture: ShiftFixture): Promise<string> {
    const locationId = randomUUID();
    await this.adminPool.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          status, accepting_intake, updated_at)
       VALUES ($1, $2, 'Second shift location', $3, 'Address', 'Asia/Amman',
               'JOD', 'ACTIVE', TRUE, transaction_timestamp())`,
      [locationId, fixture.organizationId, randomUUID()],
    );
    await this.adminPool.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [fixture.organizationId, fixture.membershipId, locationId],
    );
    return locationId;
  }

  async countAudit(shiftId: string, eventType?: string): Promise<number> {
    const result = await this.adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE entity_type = 'Shift' AND entity_id = $1
         AND ($2::text IS NULL OR event_type = $2)`,
      [shiftId, eventType ?? null],
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}

export async function expectShiftError(
  operation: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected Shift error ${code}.`);
  } catch (error) {
    if ((error as { code?: string }).code !== code) throw error;
  }
}
