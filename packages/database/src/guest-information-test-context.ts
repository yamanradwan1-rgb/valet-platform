import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";

export const enabled = process.env.ISSUE316_ISOLATED_DB_TEST === "1";
const adminUrl = process.env.TEST_DATABASE_URL ?? "";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const databaseName = `valet_issue316_${suffix}`;
export const role = `valet_i316_runtime_${suffix}`;
const rolePassword = `qa-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
export const ids = {
  org: randomUUID(),
  otherOrg: randomUUID(),
  first: randomUUID(),
  second: randomUUID(),
  foreign: randomUUID(),
  admin: randomUUID(),
  manager: randomUUID(),
  outsider: randomUUID(),
  adminUser: randomUUID(),
  managerUser: randomUUID(),
  outsiderUser: randomUUID(),
};

export let owner: Pool;
export let runtime: Pool;

function scopedUrl(username?: string, password?: string) {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  if (username) url.username = username;
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

async function addOrganization(id: string) {
  await owner.query(
    `INSERT INTO organizations(id,name,status,timezone,updated_at)
     VALUES($1,'Issue316 QA','ACTIVE','Asia/Amman',clock_timestamp())`,
    [id],
  );
}

async function addLocation(id: string, orgId: string, suffixCode: string) {
  await owner.query(
    `INSERT INTO locations(id,organization_id,name,code,address_text,
                           timezone,currency,status,updated_at)
     VALUES($1,$2,'Disposable site',$3,'QA','Asia/Amman','JOD',
            'ACTIVE',clock_timestamp())`,
    [id, orgId, suffixCode],
  );
}

async function addMember(
  id: string,
  userId: string,
  orgId: string,
  memberRole: string,
) {
  await owner.query(
    `INSERT INTO users(id,email,password_hash,status,updated_at)
     VALUES($1,$2,'not-a-real-password-hash','ACTIVE',clock_timestamp())`,
    [userId, `${userId}@issue316.invalid`],
  );
  await owner.query(
    `INSERT INTO organization_memberships(
       id,organization_id,user_id,role,status,updated_at)
     VALUES($1,$2,$3,$4::membership_role,'ACTIVE',clock_timestamp())`,
    [id, orgId, userId, memberRole],
  );
}

export async function savePrivacy(
  actor: string,
  org: string,
  loc: string,
  revision: number,
  english = "",
  arabic = "شركة تجريبية",
) {
  const result = await runtime.query<{ revision: number }>(
    `SELECT guest_information_save_privacy(
       $1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,
       $6::text,$7::text,$8::integer) AS revision`,
    [actor, org, loc, english, "", arabic, "", revision],
  );
  return result.rows[0]!.revision;
}

export async function publish(
  actor: string,
  org: string,
  loc: string,
  revision: number,
) {
  return runtime.query(
    `SELECT guest_information_publish_privacy(
       $1::uuid,$2::uuid,$3::uuid,$4::integer)`,
    [actor, org, loc, revision],
  );
}

export async function initializeIssue316() {
  if (!enabled) return;
  const target = new URL(adminUrl);
  if (
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    !/^\/valet316[-_a-z0-9]*$/i.test(target.pathname)
  ) {
    throw new Error(
      "Issue316 requires a selected loopback disposable TEST_DATABASE_URL.",
    );
  }
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await bootstrap.end();
  }
  runScript([
    prismaCli,
    "migrate",
    "deploy",
    "--schema",
    "prisma/schema.prisma",
  ]);
  runScript(
    ["scripts/provision-runtime-role.mjs"],
    scopedUrl(role, rolePassword),
  );
  owner = new Pool({ connectionString: scopedUrl() });
  runtime = new Pool({ connectionString: scopedUrl(role, rolePassword) });
  await addOrganization(ids.org);
  await addOrganization(ids.otherOrg);
  await addLocation(ids.first, ids.org, "316-A");
  await addLocation(ids.second, ids.org, "316-B");
  await addLocation(ids.foreign, ids.otherOrg, "316-X");
  await addMember(ids.admin, ids.adminUser, ids.org, "ORG_ADMIN");
  await addMember(ids.manager, ids.managerUser, ids.org, "LOCATION_MANAGER");
  await addMember(ids.outsider, ids.outsiderUser, ids.otherOrg, "ORG_ADMIN");
  await owner.query(
    `INSERT INTO membership_location_access(
       organization_id,membership_id,location_id,created_at)
     VALUES($1,$2,$3,clock_timestamp())`,
    [ids.org, ids.manager, ids.first],
  );
}

export async function disposeIssue316() {
  if (!enabled) return;
  await runtime?.end();
  await owner?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(
      `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
    );
    await bootstrap.query(`DROP ROLE IF EXISTS "${role}"`);
  } finally {
    await bootstrap.end();
  }
}
