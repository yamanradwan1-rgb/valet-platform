import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.ISSUE313_ISOLATED_DB_TEST === "1";
const adminUrl = process.env.TEST_DATABASE_URL ?? "";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_issue313_${suffix}`;
const runtimeRole = `valet_issue313_runtime_${suffix}`;
const runtimePassword = `test-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url));

interface Projection {
  eligibleCompletedVisits: number;
  ratedVisits: number;
  averageRating: string | null;
  participationRate: string | null;
  distribution: Record<"one" | "two" | "three" | "four" | "five", number>;
  recentRatings: Array<{
    visitReference: string;
    rating: number;
    completedAt: string;
    ratedAt: string;
    authorizedLocationLabel: string;
    locationTimezone: string;
  }>;
}

let owner: Pool;
let runtime: Pool;
const sample = {
  firstOrg: randomUUID(),
  secondOrg: randomUUID(),
  amman: randomUUID(),
  losAngeles: randomUUID(),
  foreignLocation: randomUUID(),
  user: randomUUID(),
  membership: randomUUID(),
  foreignUser: randomUUID(),
  foreignMembership: randomUUID(),
};

function scopedUrl(role?: string, password?: string) {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  if (role) url.username = role;
  if (password) url.password = password;
  return url.toString();
}

function runScript(args: string[], runtimeUrl?: string) {
  execFileSync(process.execPath, args, {
    cwd: packageRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      MIGRATION_DATABASE_URL: scopedUrl(),
      DATABASE_URL: runtimeUrl,
    },
    stdio: "pipe",
  });
}

async function organization(id: string, timezone: string) {
  await owner.query(
    `INSERT INTO organizations(id,name,status,timezone,updated_at)
     VALUES($1,'Issue 313 isolated','ACTIVE',$2,clock_timestamp())`,
    [id, timezone],
  );
}

async function location(
  id: string, organizationId: string, name: string, code: string, timezone: string,
) {
  await owner.query(
    `INSERT INTO locations(
       id,organization_id,name,code,address_text,timezone,currency,updated_at
     ) VALUES($1,$2,$3,$4,'Disposable test',$5,'JOD',clock_timestamp())`,
    [id, organizationId, name, code, timezone],
  );
}

async function membership(id: string, userId: string, organizationId: string) {
  await owner.query(
    `INSERT INTO users(id,email,password_hash,status,updated_at)
     VALUES($1,$2,'test-only','ACTIVE',clock_timestamp())`,
    [userId, `${userId}@issue313.test`],
  );
  await owner.query(
    `INSERT INTO organization_memberships(
       id,organization_id,user_id,role,status,updated_at
     ) VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',clock_timestamp())`,
    [id, organizationId, userId],
  );
}

async function visit(input: {
  organizationId: string; locationId: string; membershipId: string;
  completedAt: string; rating?: number; ratedAt?: string;
}) {
  const vehicleId = randomUUID();
  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await owner.query(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     VALUES($1,$2,'Issue313 fixture',clock_timestamp())`,
    [vehicleId, input.organizationId],
  );
  await owner.query(
    `INSERT INTO valet_sessions(
       id,customer_access_token_hash,customer_access_expires_at,
       organization_id,location_id,vehicle_id,state,
       checked_in_by_membership_id,completed_at,updated_at
     ) VALUES($1,$2,clock_timestamp()+interval '1 day',$3,$4,$5,
       'COMPLETED',$6,$7::timestamptz,clock_timestamp())`,
    [
      id, `sha256:v1:${tokenHash}`, input.organizationId, input.locationId,
      vehicleId, input.membershipId, input.completedAt,
    ],
  );
  if (input.rating !== undefined) {
    await owner.query(
      `INSERT INTO guest_ratings(
         organization_id,location_id,valet_session_id,rating,rated_at
       ) VALUES($1,$2,$3,$4,$5::timestamptz)`,
      [input.organizationId, input.locationId, id, input.rating, input.ratedAt],
    );
  }
}

async function projection(
  organizationId: string, locationId: string | null, from: string, to: string,
) {
  const result = await runtime.query<{ payload: Projection }>(
    `SELECT public.management_rating_analytics_projection(
       $1::uuid,$2::uuid,$3::date,$4::date
     ) AS payload`,
    [organizationId, locationId, from, to],
  );
  return result.rows[0]!.payload;
}

beforeAll(async () => {
  if (!enabled) return;
  const target = new URL(adminUrl);
  if (!(["127.0.0.1", "localhost"].includes(target.hostname) &&
        /^\/valet313[-\w]*$/.test(target.pathname))) {
    throw new Error("Issue #313 requires an explicitly selected loopback disposable TEST_DATABASE_URL.");
  }
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();
  runScript([prismaCli, "migrate", "deploy", "--schema", "prisma/schema.prisma"]);
  const runtimeUrl = scopedUrl(runtimeRole, runtimePassword);
  runScript(["scripts/provision-runtime-role.mjs"], runtimeUrl);
  owner = new Pool({ connectionString: scopedUrl() });
  runtime = new Pool({ connectionString: runtimeUrl });

  await organization(sample.firstOrg, "Asia/Amman");
  await organization(sample.secondOrg, "UTC");
  await location(sample.amman, sample.firstOrg, "Amman Site", "J13-A", "Asia/Amman");
  await location(sample.losAngeles, sample.firstOrg, "LA Site", "J13-L", "America/Los_Angeles");
  await location(sample.foreignLocation, sample.secondOrg, "Hidden Site", "J13-X", "UTC");
  await membership(sample.membership, sample.user, sample.firstOrg);
  await membership(sample.foreignMembership, sample.foreignUser, sample.secondOrg);

  await visit({
    organizationId: sample.firstOrg, locationId: sample.amman,
    membershipId: sample.membership, completedAt: "2026-10-20T19:00:00Z",
    rating: 5, ratedAt: "2026-10-22T03:00:00Z",
  });
  await visit({
    organizationId: sample.firstOrg, locationId: sample.amman,
    membershipId: sample.membership, completedAt: "2026-10-20T12:00:00Z",
  });
  await visit({
    organizationId: sample.firstOrg, locationId: sample.losAngeles,
    membershipId: sample.membership, completedAt: "2026-10-21T04:30:00Z",
    rating: 3, ratedAt: "2026-10-21T20:00:00Z",
  });
  await visit({
    organizationId: sample.firstOrg, locationId: sample.losAngeles,
    membershipId: sample.membership, completedAt: "2026-10-20T06:30:00Z",
    rating: 4, ratedAt: "2026-10-21T21:00:00Z",
  });
  await visit({
    organizationId: sample.secondOrg, locationId: sample.foreignLocation,
    membershipId: sample.foreignMembership, completedAt: "2026-10-20T11:00:00Z",
    rating: 1, ratedAt: "2026-10-21T14:00:00Z",
  });
  await visit({
    organizationId: sample.firstOrg, locationId: sample.amman,
    membershipId: sample.membership, completedAt: "2026-10-22T12:00:00Z",
  });
}, 180_000);

afterAll(async () => {
  if (!enabled) return;
  await runtime?.end();
  await owner?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
  await bootstrap.end();
}, 60_000);

describe.skipIf(!enabled)("Issue #313 restricted rating analytics projection", () => {
  it("keeps direct rating table reads denied and function execute tightly granted", async () => {
    const rights = await owner.query<{
      select_allowed: boolean; execute_allowed: boolean;
      public_denied: boolean; definer: boolean; safe_path: boolean; owner_safe: boolean;
    }>(
      `SELECT has_table_privilege($1,'public.guest_ratings','SELECT') AS select_allowed,
              has_function_privilege($1,p.oid,'EXECUTE') AS execute_allowed,
              p.prosecdef AS definer, p.proowner<>r.oid AS owner_safe,
              p.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AS safe_path,
              NOT EXISTS(SELECT 1 FROM aclexplode(
                COALESCE(p.proacl,acldefault('f',p.proowner))) acl
                WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_denied
       FROM pg_proc p JOIN pg_roles r ON r.rolname=$1
       WHERE p.oid='public.management_rating_analytics_projection(uuid,uuid,date,date)'::regprocedure`,
      [runtimeRole],
    );
    expect(rights.rows[0]).toEqual({
      select_allowed: false, execute_allowed: true, public_denied: true,
      definer: true, safe_path: true, owner_safe: true,
    });
    await expect(runtime.query("SELECT count(*) FROM public.guest_ratings"))
      .rejects.toMatchObject({ code: "42501" });
  });

  it("aggregates completed-date cohorts per timezone, without tenant leakage", async () => {
    const all = await projection(sample.firstOrg, null, "2026-10-20", "2026-10-20");
    expect(all.eligibleCompletedVisits).toBe(3);
    expect(all.ratedVisits).toBe(2);
    expect(all.averageRating).toBe("4.0000");
    expect(all.participationRate).toBe("0.666667");
    expect(all.distribution).toEqual({ five: 1, four: 0, three: 1, two: 0, one: 0 });
    expect(all.recentRatings).toHaveLength(2);
    expect(all.recentRatings.map((r) => r.rating).sort()).toEqual([3, 5]);
    expect(all.recentRatings.every((r) => /^VISIT-[0-9A-F]{12}$/.test(r.visitReference)))
      .toBe(true);
    expect(all.recentRatings.map((r) => r.locationTimezone).sort())
      .toEqual(["America/Los_Angeles", "Asia/Amman"]);
    expect(JSON.stringify(all)).not.toMatch(/customer_access|token|phone|plate|membership/i);
  });

  it("returns truthful unrated, empty, exact Location and foreign-Location scopes", async () => {
    const local = await projection(sample.firstOrg, sample.amman, "2026-10-20", "2026-10-20");
    expect([local.eligibleCompletedVisits, local.ratedVisits, local.averageRating,
      local.participationRate]).toEqual([2, 1, "5.0000", "0.500000"]);
    const empty = await projection(sample.firstOrg, null, "2026-10-01", "2026-10-01");
    expect([empty.eligibleCompletedVisits, empty.ratedVisits, empty.averageRating,
      empty.participationRate]).toEqual([0, 0, null, null]);
    const foreign = await projection(
      sample.firstOrg, sample.foreignLocation, "2026-10-20", "2026-10-20",
    );
    expect(foreign.eligibleCompletedVisits).toBe(0);
    expect(foreign.recentRatings).toEqual([]);
    expect((await projection(
      sample.secondOrg, sample.foreignLocation, "2026-10-20", "2026-10-20",
    )).distribution.one).toBe(1);
    const unrated = await projection(sample.firstOrg, sample.amman, "2026-10-22", "2026-10-22");
    expect(unrated).toMatchObject({
      eligibleCompletedVisits: 1, ratedVisits: 0,
      averageRating: null, participationRate: "0.000000",
      distribution: { one: 0, two: 0, three: 0, four: 0, five: 0 },
      recentRatings: [],
    });
  });

  it("rejects direct calls outside the authorized 31-day period envelope", async () => {
    await expect(projection(sample.firstOrg, null, "2026-01-01", "2026-10-22"))
      .rejects.toMatchObject({ code: "22023" });
    await expect(projection(sample.firstOrg, null, "2026-10-22", "2026-10-01"))
      .rejects.toMatchObject({ code: "22023" });
  });
});
