import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { Pool } from "pg";

import {
  createRuntimePostgresPool,
  type PostgresPool,
} from "../src/common/database/postgres";
import type { MembershipRole } from "../src/modules/staff/custody-staff-authorizer";

export interface ReturningFixture {
  locationId: string;
  membershipId: string;
  organizationId: string;
  userId: string;
}

export function differentCustomer(phone: string, displayName?: string) {
  return {
    ...(displayName === undefined ? {} : { displayName }),
    intent: "DIFFERENT_CUSTOMER" as const,
    phone,
  };
}

const sourceUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}_${randomBytes(4).toString("hex")}`;
const databaseName = `returning_check_in_${suffix}`;
const runtimeRole = `returning_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const repositoryRoot = resolve(process.cwd(), "../..");

function databaseUrl(database: string, runtime = false): string {
  const url = new URL(sourceUrl);
  url.pathname = `/${database}`;
  if (runtime) {
    url.username = runtimeRole;
    url.password = runtimePassword;
  }
  return url.toString();
}

async function runPnpm(args: string[], environment: NodeJS.ProcessEnv) {
  const npmExecPath = process.env.npm_execpath;
  const command =
    npmExecPath === undefined
      ? process.platform === "win32"
        ? "pnpm.cmd"
        : "pnpm"
      : process.execPath;
  const commandArgs = npmExecPath === undefined ? args : [npmExecPath, ...args];
  const env = { ...process.env, ...environment };
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete env[key];
  }
  await new Promise<void>((done, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: repositoryRoot,
      env,
      shell: npmExecPath === undefined && process.platform === "win32",
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? done()
        : reject(
            new Error(
              `Database setup failed (${String(code)}): ${[
                sourceUrl,
                runtimePassword,
                ...Object.values(environment).filter(
                  (value): value is string =>
                    typeof value === "string" && value !== "",
                ),
              ].reduce(
                (safe, secret) => safe.replaceAll(secret, "[REDACTED]"),
                output,
              )}`,
            ),
          ),
    );
  });
}

export class ReturningCheckInTestContext {
  admin!: Pool;
  runtime!: PostgresPool;
  private databaseCreated = false;
  private roleCreated = false;

  async start(): Promise<void> {
    const bootstrap = new Pool({
      connectionString: sourceUrl,
      connectionTimeoutMillis: 5_000,
    });
    try {
      await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
      this.databaseCreated = true;
    } finally {
      await bootstrap.end();
    }
    const migrationUrl = databaseUrl(databaseName);
    const runtimeUrl = databaseUrl(databaseName, true);
    await runPnpm(["--filter", "@valet/database", "migrate:deploy"], {
      DATABASE_URL: undefined,
      MIGRATION_DATABASE_URL: migrationUrl,
      NODE_ENV: "test",
    });
    await runPnpm(["--filter", "@valet/database", "runtime:provision"], {
      DATABASE_URL: runtimeUrl,
      MIGRATION_DATABASE_URL: migrationUrl,
      NODE_ENV: "test",
    });
    this.roleCreated = true;
    this.admin = new Pool({ connectionString: migrationUrl });
    this.runtime = createRuntimePostgresPool(runtimeUrl);
  }

  async stop(): Promise<void> {
    await this.runtime?.end();
    await this.admin?.end();
    const bootstrap = new Pool({
      connectionString: sourceUrl,
      connectionTimeoutMillis: 5_000,
    });
    try {
      if (this.databaseCreated) {
        await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
      }
      if (this.roleCreated)
        await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
    } finally {
      await bootstrap.end();
    }
  }

  async fixture(
    options: {
      locationAccess?: boolean;
      organizationId?: string;
      role?: MembershipRole;
    } = {},
  ): Promise<ReturningFixture> {
    const organizationId = options.organizationId ?? randomUUID();
    const ids = {
      locationId: randomUUID(),
      membershipId: randomUUID(),
      organizationId,
      userId: randomUUID(),
    };
    const token = randomUUID();
    if (options.organizationId === undefined) {
      await this.admin.query(
        `INSERT INTO organizations (id, name, status, timezone, updated_at)
         VALUES ($1, $2, 'ACTIVE', 'Asia/Amman', transaction_timestamp())`,
        [organizationId, `Returning ${token}`],
      );
    }
    await this.admin.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency, status, updated_at)
       VALUES ($1, $2, 'Returning location', $3, 'Address', 'Asia/Amman', 'JOD',
               'ACTIVE', transaction_timestamp())`,
      [ids.locationId, organizationId, token],
    );
    await this.admin.query(
      `INSERT INTO users (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, 'not-real', 'ACTIVE', transaction_timestamp())`,
      [ids.userId, `${token}@returning.test`],
    );
    await this.admin.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', transaction_timestamp())`,
      [
        ids.membershipId,
        organizationId,
        ids.userId,
        options.role ?? "VALET_EMPLOYEE",
      ],
    );
    if (options.locationAccess !== false) {
      await this.admin.query(
        `INSERT INTO membership_location_access (organization_id, membership_id, location_id)
         VALUES ($1, $2, $3)`,
        [organizationId, ids.membershipId, ids.locationId],
      );
    }
    return ids;
  }

  async addLocation(fixture: ReturningFixture): Promise<string> {
    const locationId = randomUUID();
    await this.admin.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency, status, updated_at)
       VALUES ($1, $2, 'Second', $3, 'Address', 'Asia/Amman', 'JOD', 'ACTIVE', transaction_timestamp())`,
      [locationId, fixture.organizationId, randomUUID()],
    );
    await this.admin.query(
      `INSERT INTO membership_location_access (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [fixture.organizationId, fixture.membershipId, locationId],
    );
    return locationId;
  }
}
