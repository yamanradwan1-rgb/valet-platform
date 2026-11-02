import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = new URL("../prisma/migrations/", import.meta.url);
const admin =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const freshName = "valet_408_fresh_" + randomUUID().replaceAll("-", ""),
  upgradeName = "valet_408_upgrade_" + randomUUID().replaceAll("-", "");
const names: string[] = [];
let fresh: Client, upgrade: Client;
const index = "organization_memberships_user_id_id_idx";
async function db(name: string) {
  const c = new Client({ connectionString: admin });
  await c.connect();
  await c.query(`CREATE DATABASE "${name}"`);
  await c.end();
  const url = new URL(admin);
  url.pathname = "/" + name;
  const scoped = new Client({ connectionString: url.toString() });
  await scoped.connect();
  return scoped;
}
async function apply(c: Client, name: string) {
  await c.query(await readFile(new URL(name + "/migration.sql", root), "utf8"));
}
beforeAll(async () => {
  names.push(
    ...(await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort(),
  );
  fresh = await db(freshName);
  upgrade = await db(upgradeName);
  for (const name of names) {
    await apply(fresh, name);
    if (name !== names.at(-1)) await apply(upgrade, name);
  }
  await upgrade.query(
    "INSERT INTO users(id,email,password_hash,updated_at) VALUES($1,'migration408@example.invalid','synthetic',clock_timestamp());",
    ["00000000-0000-4000-8000-000000000001"],
  );
  await upgrade.query(
    "INSERT INTO organizations(id,name,timezone,updated_at) VALUES($1,'probe','UTC',clock_timestamp())",
    ["00000000-0000-4000-8000-000000000002"],
  );
  await upgrade.query(
    "INSERT INTO organization_memberships(id,user_id,organization_id,role,status,updated_at) VALUES($1,$2,$3,'VALET_EMPLOYEE','INACTIVE',clock_timestamp())",
    [
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ],
  );
}, 120000);
afterAll(async () => {
  await fresh?.end();
  await upgrade?.end();
  const c = new Client({ connectionString: admin });
  await c.connect();
  try {
    for (const name of [freshName, upgradeName])
      await c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } finally {
    await c.end();
  }
}, 60000);
describe("Issue 408 canonical guarded bootstrap and existing-data upgrade", () => {
  it("does not let the initial membership-table probe wait behind DDL", async () => {
    const url = new URL(admin);
    url.pathname = "/" + upgradeName;
    const blocker = new Client({ connectionString: url.toString() });
    await blocker.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        "LOCK TABLE organization_memberships IN ACCESS EXCLUSIVE MODE",
      );
      await expect(apply(upgrade, names.at(-1)!)).rejects.toMatchObject({
        code: "55P03",
      });
    } finally {
      await blocker.query("ROLLBACK");
      await blocker.end();
    }
  });
  it("applies 107 ordered migrations to empty schema and preserves the existing factor unique", async () => {
    expect(names).toHaveLength(107);
    expect(names.at(-1)).toBe(
      "20261101010700_issue408_mfa_disable_policy_index",
    );
    const indexes = await fresh.query(
      "SELECT indexname,indexdef FROM pg_indexes WHERE indexname=ANY($1::text[])",
      [[index, "user_mfa_totp_factors_user_id_id_key"]],
    );
    expect(indexes.rows).toHaveLength(2);
    expect(indexes.rows.find((x) => x.indexname === index).indexdef).toContain(
      "(user_id, id)",
    );
  });
  it("fails on nonempty memberships without acquiring a blocking index build", async () => {
    await expect(apply(upgrade, names.at(-1)!)).rejects.toThrow(
      "nonempty memberships require separately authorized online index rollout",
    );
    expect(
      (
        await upgrade.query(
          "SELECT count(*)::int n FROM organization_memberships",
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (await upgrade.query("SELECT to_regclass($1) object", [index])).rows[0]
        .object,
    ).toBeNull();
  });
  it("rejects a wrong same-name index instead of accepting IF NOT EXISTS", async () => {
    await upgrade.query(
      `CREATE INDEX ${index} ON organization_memberships(user_id)`,
    );
    await expect(apply(upgrade, names.at(-1)!)).rejects.toThrow(
      "conflicting or invalid",
    );
    await upgrade.query(`DROP INDEX ${index}`);
  });
  it("accepts concurrent preinstallation with existing data, exact shape and no row change", async () => {
    const before = (
      await upgrade.query("SELECT * FROM organization_memberships")
    ).rows;
    await upgrade.query(
      `CREATE INDEX CONCURRENTLY ${index} ON organization_memberships(user_id,id)`,
    );
    await apply(upgrade, names.at(-1)!);
    expect(
      (await upgrade.query("SELECT * FROM organization_memberships")).rows,
    ).toEqual(before);
    expect(
      (
        await upgrade.query(
          "SELECT indisvalid,indisready,indisunique FROM pg_index WHERE indexrelid=$1::regclass",
          [index],
        )
      ).rows[0],
    ).toEqual({ indisvalid: true, indisready: true, indisunique: false });
  });
});
