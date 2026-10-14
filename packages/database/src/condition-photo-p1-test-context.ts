import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

import { ConditionPhotoP1OwnedTarget } from "./condition-photo-p1-owned-target.js";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const migrations = join(packageRoot, "prisma/migrations");
const photoMigration = "20261014008000_issue_215_verified_condition_photo_p1";
const prismaCli = join(packageRoot, "node_modules/prisma/build/index.js");

export interface PhotoTestScope {
  readonly orgId: string;
  readonly locationId: string;
  readonly memberId: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly vehicleId: string;
}

export interface ReservedPhoto {
  readonly operation_id: string;
  readonly attempt_id: string;
  readonly object_key: string;
  readonly lease_owner: string;
}

export class ConditionPhotoP1TestContext {
  name = "";
  dbUrl = "";
  readonly bootstrapUrl: string;
  pool!: Pool;
  private readonly target: ConditionPhotoP1OwnedTarget;
  private scratch?: string;

  constructor() {
    this.target = new ConditionPhotoP1OwnedTarget();
    this.bootstrapUrl = this.target.bootstrapUrl;
  }

  private deploy(configPath?: string): void {
    execFileSync(
      process.execPath,
      [prismaCli, "migrate", "deploy", ...(configPath ? ["--config", configPath] : [])],
      {
        cwd: packageRoot,
        env: {
          ...process.env,
          DATABASE_URL: undefined,
          MIGRATION_DATABASE_URL: this.dbUrl,
          NODE_ENV: "test",
        },
        stdio: "pipe",
        windowsHide: true,
        timeout: 180_000,
      },
    );
  }

  async start(upgradeBaseline = false): Promise<void> {
    const disposable = await this.target.createDatabase();
    this.name = disposable.name;
    this.dbUrl = disposable.url;

    if (upgradeBaseline) {
      const scratchRoot = join(packageRoot, "tmp");
      mkdirSync(scratchRoot, { recursive: true });
      this.scratch = mkdtempSync(join(scratchRoot, "issue215-p1-upgrade-"));
      cpSync(join(packageRoot, "prisma/schema.prisma"), join(this.scratch, "schema.prisma"));
      mkdirSync(join(this.scratch, "migrations"));
      cpSync(join(migrations, "migration_lock.toml"), join(this.scratch, "migrations/migration_lock.toml"));
      for (const name of readdirSync(migrations).filter((name) => /^\d/.test(name) && name < photoMigration)) {
        cpSync(join(migrations, name), join(this.scratch, "migrations", name), { recursive: true });
      }
      writeFileSync(
        join(this.scratch, "prisma.config.ts"),
        'import { defineConfig } from "prisma/config";\nexport default defineConfig({schema:"schema.prisma",migrations:{path:"migrations"},datasource:{url:process.env.MIGRATION_DATABASE_URL}});\n',
      );
      this.deploy(join(this.scratch, "prisma.config.ts"));
    } else {
      this.deploy();
    }
    this.pool = new Pool({ connectionString: this.dbUrl, max: 3 });
  }

  async upgrade(): Promise<void> {
    if (!this.scratch) throw new Error("Missing predecessor migration snapshot.");
    cpSync(join(migrations, photoMigration), join(this.scratch, "migrations", photoMigration), { recursive: true });
    this.deploy(join(this.scratch, "prisma.config.ts"));
  }

  async seed(userId?: string): Promise<PhotoTestScope> {
    const orgId = randomUUID();
    const locationId = randomUUID();
    const memberId = randomUUID();
    const sessionId = randomUUID();
    const vehicleId = randomUUID();
    const actualUserId = userId ?? randomUUID();
    await this.pool.query(
      "INSERT INTO organizations(id,name,status,timezone,updated_at) VALUES($1,'P1 isolated test','ACTIVE','Asia/Amman',clock_timestamp())",
      [orgId],
    );
    if (!userId) {
      await this.pool.query(
        "INSERT INTO users(id,email,password_hash,status,updated_at) VALUES($1,$2,'test-only','ACTIVE',clock_timestamp())",
        [actualUserId, `${actualUserId}@issue215.test.invalid`],
      );
    }
    await this.pool.query(
      `INSERT INTO organization_memberships
         (id,organization_id,user_id,role,status,updated_at)
       VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',clock_timestamp())`,
      [memberId, orgId, actualUserId],
    );
    await this.pool.query(
      `INSERT INTO locations
         (id,organization_id,name,code,address_text,timezone,currency,status,updated_at)
       VALUES($1,$2,'P1 location',$3,'Test','Asia/Amman','JOD','ACTIVE',clock_timestamp())`,
      [locationId, orgId, randomUUID()],
    );
    await this.pool.query(
      `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
       VALUES($1,$2,$3)`,
      [orgId, memberId, locationId],
    );
    await this.pool.query(
      "INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at) VALUES($1,$2,'Test vehicle',clock_timestamp())",
      [vehicleId, orgId],
    );
    await this.pool.query(
      `INSERT INTO valet_sessions
         (id,customer_access_token_hash,customer_access_expires_at,
          organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,updated_at)
       VALUES($1,$2,clock_timestamp()+interval '1 hour',$3,$4,$5,'CHECKING_IN',$6,clock_timestamp())`,
      [sessionId, `issue215:${randomUUID()}`, orgId, locationId, vehicleId, memberId],
    );
    return { orgId, locationId, memberId, sessionId, userId: actualUserId, vehicleId };
  }

  async reserve(scope: PhotoTestScope, clientId = randomUUID()): Promise<ReservedPhoto> {
    const result = await this.pool.query<ReservedPhoto>(
      `SELECT * FROM public.condition_photo_reserve_upload(
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,
         decode(repeat('a',64),'hex'),256,1,'issue215_test')`,
      [scope.userId, scope.memberId, scope.sessionId, clientId],
    );
    if (!result.rows[0]) throw new Error("Reservation returned no fenced attempt.");
    return result.rows[0];
  }

  async markStored(
    scope: PhotoTestScope,
    record: ReservedPhoto,
    digestHex = "b".repeat(64),
  ): Promise<void> {
    await this.pool.query(
      `SELECT public.condition_photo_mark_stored(
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,
         NULL::text, decode($6::text,'hex'),256,10,10)`,
      [
        scope.userId, scope.memberId, record.operation_id,
        record.attempt_id, record.lease_owner, digestHex,
      ],
    );
  }

  async finalize(scope: PhotoTestScope, record: ReservedPhoto): Promise<string> {
    const state = await this.pool.query<{ status: string }>(
      `SELECT status::text FROM condition_photo_upload_attempts WHERE id=$1`,
      [record.attempt_id],
    );
    if (state.rows[0]?.status === "WRITING") await this.markStored(scope, record);
    const result = await this.pool.query<{ id: string }>(
      `SELECT public.condition_photo_finalize_upload(
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,
         NULL::text, decode(repeat('b',64),'hex'),256,10,10)::text AS id`,
      [scope.userId, scope.memberId, record.operation_id, record.attempt_id, record.lease_owner],
    );
    return result.rows[0]?.id ?? "";
  }

  async stop(): Promise<void> {
    try {
      await this.pool?.end();
    } finally {
      try { await this.target.close(); }
      finally { if (this.scratch) rmSync(this.scratch, { recursive: true, force: true }); }
    }
  }
}
