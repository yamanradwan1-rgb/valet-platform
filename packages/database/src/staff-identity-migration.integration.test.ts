import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { expectedMigrationDirectories } from "./migration-manifest.js";
import { expectedCurrentMigrationDirectories } from "./issue304-migration-source-appendix.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = join(root, "node_modules/prisma/build/index.js");
const migration = "20261001004900_mgt_240a_staff_identity";
const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = randomUUID().replaceAll("-", "");
const upgradeName = `valet_staff_identity_upgrade_${suffix}`;
const freshName = `valet_staff_identity_fresh_${suffix}`;
const role = `valet_staff_identity_runtime_${suffix}`;
const password = randomUUID();
const ids = {
  org: randomUUID(),
  user: randomUUID(),
  member: randomUUID(),
  location: randomUUID(),
};
let upgrade: Pool;
let fresh: Client;
let runtime: Pool;
let scratch: string;
let snapshot: Record<string, unknown>[];

function url(name: string, restricted = false) {
  const value = new URL(adminUrl);
  value.pathname = `/${name}`;
  if (restricted) {
    value.username = role;
    value.password = password;
  }
  return value.toString();
}
function run(name: string, args: string[], provision = false) {
  execFileSync(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "test",
      MIGRATION_DATABASE_URL: url(name),
      DATABASE_URL: provision ? url(name, true) : undefined,
    },
    stdio: "pipe",
  });
}
const snapshotSql = `SELECT m.id,m.organization_id,m.user_id,m.role,m.status,m.version,m.created_at,m.updated_at,
  u.email,u.password_hash,u.status AS user_status,a.location_id
  FROM organization_memberships m JOIN users u ON u.id=m.user_id
  JOIN membership_location_access a ON a.membership_id=m.id AND a.organization_id=m.organization_id`;

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE DATABASE "${upgradeName}"`);
    await bootstrap.query(`CREATE DATABASE "${freshName}"`);
  } finally {
    await bootstrap.end();
  }
  mkdirSync(join(root, "tmp"), { recursive: true });
  scratch = mkdtempSync(join(root, "tmp", "staff-identity-upgrade-"));
  cpSync(join(root, "prisma/schema.prisma"), join(scratch, "schema.prisma"));
  mkdirSync(join(scratch, "migrations"));
  cpSync(
    join(root, "prisma/migrations/migration_lock.toml"),
    join(scratch, "migrations/migration_lock.toml"),
  );
  for (const name of expectedMigrationDirectories.slice(
    0,
    expectedMigrationDirectories.indexOf(migration),
  )) {
    cpSync(
      join(root, "prisma/migrations", name),
      join(scratch, "migrations", name),
      { recursive: true },
    );
  }
  const config = join(scratch, "prisma.config.ts");
  writeFileSync(
    config,
    'import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: "schema.prisma", migrations: { path: "migrations" }, datasource: { url: process.env.MIGRATION_DATABASE_URL } });\n',
  );
  run(upgradeName, [cli, "migrate", "deploy", "--config", config]);
  upgrade = new Pool({ connectionString: url(upgradeName) });
  const before = await upgrade.query(
    "SELECT count(*)::int AS n,max(migration_name) AS latest FROM _prisma_migrations WHERE finished_at IS NOT NULL",
  );
  expect(before.rows[0]).toEqual({
    n: 48,
    latest: "20261001004800_mgt_236_parking_zone_creation",
  });
  await upgrade.query(
    `INSERT INTO organizations(id,name,timezone,updated_at) VALUES($1,'Preserved','Asia/Amman',now())`,
    [ids.org],
  );
  await upgrade.query(
    `INSERT INTO users(id,email,password_hash,updated_at) VALUES($1,'real.legacy@example.com','preserved-hash',now())`,
    [ids.user],
  );
  await upgrade.query(
    `INSERT INTO organization_memberships(id,organization_id,user_id,role,status,version,updated_at)
    VALUES($1,$2,$3,'VALET_EMPLOYEE','INACTIVE',7,now())`,
    [ids.member, ids.org, ids.user],
  );
  await upgrade.query(
    `INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,updated_at)
    VALUES($1,$2,'Preserved','P','Address','Asia/Amman','JOD',now())`,
    [ids.location, ids.org],
  );
  await upgrade.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
    VALUES($1,$2,$3)`,
    [ids.org, ids.member, ids.location],
  );
  snapshot = (await upgrade.query(snapshotSql)).rows;
  run(upgradeName, [cli, "migrate", "deploy"]);
  run(freshName, [cli, "migrate", "deploy"]);
  fresh = new Client({ connectionString: url(freshName) });
  await fresh.connect();
  run(upgradeName, ["scripts/provision-runtime-role.mjs"], true);
  runtime = new Pool({ connectionString: url(upgradeName, true) });
}, 120_000);

afterAll(async () => {
  await runtime?.end();
  await upgrade?.end();
  await fresh?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(
      `DROP DATABASE IF EXISTS "${upgradeName}" WITH (FORCE)`,
    );
    await bootstrap.query(
      `DROP DATABASE IF EXISTS "${freshName}" WITH (FORCE)`,
    );
    await bootstrap.query(`DROP ROLE IF EXISTS "${role}"`);
  } finally {
    await bootstrap.end();
  }
  if (scratch && resolve(scratch).startsWith(resolve(root, "tmp") + sep)) {
    rmSync(scratch, { recursive: true, force: true });
  }
}, 60_000);

describe("T05-A actual Prisma 048 → 049 additive upgrade", () => {
  it("preserves every old membership/User/grant fact and leaves names null without backfill", async () => {
    expect((await upgrade.query(snapshotSql)).rows).toEqual(snapshot);
    expect(
      (
        await upgrade.query(
          "SELECT first_name,last_name FROM organization_memberships WHERE id=$1",
          [ids.member],
        )
      ).rows[0],
    ).toEqual({ first_name: null, last_name: null });
    for (const pool of [upgrade, fresh]) {
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS n,max(migration_name) AS latest FROM _prisma_migrations WHERE finished_at IS NOT NULL",
          )
        ).rows[0],
      ).toEqual({
        n: expectedCurrentMigrationDirectories.length,
        latest: expectedCurrentMigrationDirectories.at(-1),
      });
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM pg_constraint WHERE conname IN ('organization_memberships_first_name_check','organization_memberships_last_name_check')",
          )
        ).rows[0]?.n,
      ).toBe(2);
    }
  });
  it("enforces nullable nonblank/trimmed 100-code-point names without losing Unicode", async () => {
    for (const column of ["first_name", "last_name"]) {
      for (const value of [
        "",
        " ",
        "\t",
        "\u00a0",
        "\u3000",
        "\ufeff",
        " leading",
        "trailing\n",
        "أ".repeat(101),
      ]) {
        await expect(
          upgrade.query(
            `UPDATE organization_memberships SET ${column}=$1 WHERE id=$2`,
            [value, ids.member],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      }
    }
    const unicode = "𐐀".repeat(100);
    await upgrade.query(
      "UPDATE organization_memberships SET first_name=$1,last_name=$2 WHERE id=$3",
      [unicode, "مُحَمَّد O’Connor-أبو زيد", ids.member],
    );
    expect(
      (
        await upgrade.query(
          "SELECT first_name,last_name FROM organization_memberships WHERE id=$1",
          [ids.member],
        )
      ).rows[0],
    ).toEqual({ first_name: unicode, last_name: "مُحَمَّد O’Connor-أبو زيد" });
    await upgrade.query(
      "UPDATE organization_memberships SET first_name=NULL,last_name=NULL WHERE id=$1",
      [ids.member],
    );
  });
  it("repeats migrate/provision safely and preserves runtime read-only names and authority", async () => {
    run(upgradeName, [cli, "migrate", "deploy"]);
    run(upgradeName, ["scripts/provision-runtime-role.mjs"], true);
    expect(
      (
        await runtime.query(
          "SELECT first_name,last_name FROM organization_memberships WHERE id=$1",
          [ids.member],
        )
      ).rows[0],
    ).toEqual({ first_name: null, last_name: null });
    for (const column of [
      "first_name",
      "last_name",
      "role",
      "status",
      "version",
    ]) {
      await expect(
        runtime.query(
          `UPDATE organization_memberships SET ${column}=${column} WHERE id=$1`,
          [ids.member],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    }
    expect((await upgrade.query(snapshotSql)).rows).toEqual(snapshot);
  }, 60_000);
});
