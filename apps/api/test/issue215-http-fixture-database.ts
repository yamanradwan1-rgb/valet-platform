import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Pool } from "pg";

import { runtimeDatabaseUrlFor } from "./database-url-test-utils";

export interface Issue215HttpScope {
  readonly orgId: string;
  readonly locationId: string;
  readonly memberId: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly vehicleId: string;
}

interface OwnedContext {
  readonly dbUrl: string;
  readonly bootstrapUrl: string;
  readonly pool: Pool;
  start(): Promise<void>;
  stop(): Promise<void>;
  seed(): Promise<Issue215HttpScope>;
}

interface OwnedRoleTarget {
  createRole(password: string): Promise<string>;
  close(): Promise<void>;
}

export interface Issue215HttpDatabase {
  readonly admin: Pool;
  readonly runtimeUrl: string;
  seed(required?: boolean, override?: boolean | null): Promise<Issue215HttpScope>;
  createBearer(scope: Issue215HttpScope): Promise<string>;
  close(): Promise<void>;
}

export async function openIssue215HttpDatabase(): Promise<Issue215HttpDatabase> {
  // The P1 context enforces exact Docker identity and task-owned CREATE/DROP
  // boundaries. Never run this fixture against an arbitrary PostgreSQL URL.
  const fixturePath = pathToFileURL(resolve(
    __dirname, "../../../packages/database/src/condition-photo-p1-test-context.ts",
  )).href;
  const fixture = await import(/* @vite-ignore */ fixturePath) as {
    ConditionPhotoP1TestContext: new () => OwnedContext;
  };
  const targetPath = pathToFileURL(resolve(
    __dirname, "../../../packages/database/src/condition-photo-p1-owned-target.ts",
  )).href;
  const target = await import(/* @vite-ignore */ targetPath) as {
    ConditionPhotoP1OwnedTarget: new () => OwnedRoleTarget;
  };
  const owner = new fixture.ConditionPhotoP1TestContext();
  const roleOwner = new target.ConditionPhotoP1OwnedTarget();
  const password = randomBytes(32).toString("hex");
  let started = false;
  try {
    // start() can create the owned database before migration raises; ensure a
    // failed bootstrap still calls its identity-checked teardown.
    started = true;
    await owner.start();
    // The same protected P1 target owns and independently attests the role.
    // Its close() checks role identity and flags before deleting anything.
    const role = await roleOwner.createRole(password);
    const runtimeUrl = runtimeDatabaseUrlFor(
      owner.dbUrl, new URL(owner.dbUrl).pathname.slice(1), role, password,
    );
    const provisionScript = resolve(
      __dirname, "../../../packages/database/scripts/provision-runtime-role.mjs",
    );
    execFileSync(process.execPath, [provisionScript], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: runtimeUrl,
        MIGRATION_DATABASE_URL: owner.dbUrl,
      },
      timeout: 120_000,
      stdio: "pipe",
      windowsHide: true,
    });
    // Also prove the application really connects as its restricted runtime
    // principal; running these E2E queries under the migration owner is invalid.
    const restrictedProbe = new Pool({ connectionString: runtimeUrl, max: 1 });
    try {
      const proof = await restrictedProbe.query<{
        role: string; can_read: boolean; can_insert: boolean;
      }>(
        `SELECT current_user AS role,
                has_table_privilege(current_user,'public.vehicle_photo_verifications','SELECT') AS can_read,
                has_table_privilege(current_user,'public.vehicle_photo_verifications','INSERT') AS can_insert`,
      );
      if (proof.rows[0]?.role !== role || proof.rows[0].can_read !== true ||
          proof.rows[0].can_insert !== false)
        throw new Error("Issue 215 runtime database privilege boundary is unsafe.");
    } finally { await restrictedProbe.end(); }

    return {
      admin: owner.pool,
      runtimeUrl,
      async seed(required = true, override = null) {
        const scope = await owner.seed();
        await owner.pool.query(
          "UPDATE organizations SET check_in_photos_required=$2 WHERE id=$1",
          [scope.orgId, required],
        );
        await owner.pool.query(
          "UPDATE locations SET check_in_photos_required_override=$2 WHERE id=$1",
          [scope.locationId, override],
        );
        return scope;
      },
      async createBearer(scope) {
        const { generateStaffCredential, staffCredentialHash } = await import(
          "../src/modules/auth/staff-auth-credential"
        );
        const bearer = generateStaffCredential("vsa1.");
        await owner.pool.query(
          `INSERT INTO staff_auth_sessions
             (id,user_id,current_access_token_hash,access_expires_at,
              absolute_expires_at,created_at,last_rotated_at)
           VALUES($1,$2,$3,clock_timestamp()+interval '15 minutes',
              clock_timestamp()+interval '30 days',clock_timestamp(),clock_timestamp())`,
          [randomUUID(), scope.userId, staffCredentialHash("access", bearer)],
        );
        return `Bearer ${bearer}`;
      },
      close: async () => {
        try { await owner.stop(); }
        finally { await roleOwner.close(); }
      },
    };
  } catch (error) {
    if (started) await owner.stop().catch(() => undefined);
    await roleOwner.close().catch(() => undefined);
    throw error;
  }
}
