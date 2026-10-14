import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  sql: [] as string[],
  databases: new Set<string>(),
  roles: new Set<string>(),
  failOn: "",
  duplicateRole: false,
  identityFails: false,
}));

vi.mock("./condition-photo-p1-test-target.js", () => ({
  requireIssue215TestUrl: () => "postgresql://issue215_owner:fake@127.0.0.1:58487/issue215_empty",
  verifyIssue215Bootstrap: async () => {
    if (fake.identityFails) throw new Error("unverified PostgreSQL identity");
  },
}));

vi.mock("pg", () => ({
  Client: class {
    async connect() {}
    async end() {}
    async query(sql: string, params: unknown[] = []) {
      fake.sql.push(sql);
      if (fake.failOn && sql.includes(fake.failOn)) throw new Error("injected fixture failure");
      if (sql.includes("SELECT 1 FROM pg_roles")) return { rowCount: fake.duplicateRole ? 1 : 0 };
      if (sql.includes("SELECT format('CREATE ROLE")) return { rows: [{ sql: `CREATE ROLE "${params[0]}"` }] };
      if (sql.includes("FROM pg_database database")) {
        return { rows: fake.databases.has(String(params[0])) ? [{ owner: "issue215_owner" }] : [] };
      }
      if (sql.includes("rolcanlogin AS can_login")) {
        return { rows: fake.roles.has(String(params[0])) ? [{ can_login: true, can_create_db: false }] : [] };
      }
      const createdDatabase = /^CREATE DATABASE "([a-z0-9_]+)"$/.exec(sql);
      if (createdDatabase) { fake.databases.add(createdDatabase[1]!); return { rows: [], rowCount: 1 }; }
      const createdRole = /^CREATE ROLE "([a-z0-9_]+)"$/.exec(sql);
      if (createdRole) { fake.roles.add(createdRole[1]!); return { rows: [], rowCount: 1 }; }
      const droppedDatabase = /^DROP DATABASE "([a-z0-9_]+)" WITH \(FORCE\)$/.exec(sql);
      if (droppedDatabase) {
        if (!fake.databases.delete(droppedDatabase[1]!)) throw new Error("Attempted DROP of unknown database");
        return { rows: [], rowCount: 1 };
      }
      const droppedRole = /^DROP ROLE "([a-z0-9_]+)"$/.exec(sql);
      if (droppedRole) {
        if (!fake.roles.delete(droppedRole[1]!)) throw new Error("Attempted DROP of unknown role");
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    }
  },
}));

import { ConditionPhotoP1OwnedTarget } from "./condition-photo-p1-owned-target.js";

const creations = () => fake.sql.filter((sql) => /^CREATE (DATABASE|ROLE)/.test(sql));
const drops = () => fake.sql.filter((sql) => /^DROP (DATABASE|ROLE)/.test(sql));

beforeEach(() => {
  fake.sql = [];
  fake.databases.clear();
  fake.roles.clear();
  fake.failOn = "";
  fake.duplicateRole = false;
  fake.identityFails = false;
});

describe("Issue 215 partial setup and fenced teardown", () => {
  it("afterAll-style close before any setup does not connect or drop", async () => {
    const target = new ConditionPhotoP1OwnedTarget();
    await target.close();
    expect(fake.sql).toEqual([]);
  });

  it("preflight identity failure yields zero DB and role mutation", async () => {
    fake.identityFails = true;
    const target = new ConditionPhotoP1OwnedTarget();
    await expect(target.createDatabase()).rejects.toThrow("unverified");
    await target.close();
    expect(creations()).toEqual([]);
    expect(drops()).toEqual([]);
  });

  it("failed CREATE DATABASE does not invent an owned DROP", async () => {
    fake.failOn = "CREATE DATABASE";
    const target = new ConditionPhotoP1OwnedTarget();
    await expect(target.createDatabase()).rejects.toThrow("injected");
    fake.failOn = "";
    await target.close();
    expect(drops()).toEqual([]);
  });

  it("failed role creation after verified DB creation cleans only the owned database", async () => {
    const target = new ConditionPhotoP1OwnedTarget();
    const db = await target.createDatabase();
    fake.failOn = "CREATE ROLE";
    await expect(target.createRole("fake-secret")).rejects.toThrow("injected");
    fake.failOn = "";
    await target.close();
    expect(drops()).toEqual([`DROP DATABASE "${db.name}" WITH (FORCE)`]);
    expect(fake.databases.size).toBe(0);
  });

  it("failure after one created role drops only created role and database", async () => {
    const target = new ConditionPhotoP1OwnedTarget();
    const db = await target.createDatabase();
    await target.createRole("fake-secret");
    fake.failOn = "CREATE ROLE";
    await expect(target.createRole("another-secret")).rejects.toThrow("injected");
    fake.failOn = "";
    await target.close();
    expect(drops()).toHaveLength(2);
    expect(drops()[0]).toBe(`DROP DATABASE "${db.name}" WITH (FORCE)`);
    expect(drops()[1]).toMatch(/^DROP ROLE "vlt_t_role_215_[0-9a-f]{32}"$/);
    expect(fake.databases.size).toBe(0);
    expect(fake.roles.size).toBe(0);
  });

  it("rejects pre-existing matching-prefix role without changing or deleting it", async () => {
    const target = new ConditionPhotoP1OwnedTarget();
    fake.duplicateRole = true;
    await expect(target.createRole("secret")).rejects.toThrow("already exists");
    await target.close();
    expect(creations()).toEqual([]);
    expect(drops()).toEqual([]);
  });

  it("refuses DROP after identity changes even if this run created resources", async () => {
    const target = new ConditionPhotoP1OwnedTarget();
    await target.createDatabase();
    fake.identityFails = true;
    await expect(target.close()).rejects.toThrow("unverified");
    expect(drops()).toEqual([]);
  });

  it("repeated success never retains tasks or drops unrelated objects", async () => {
    for (let i = 0; i < 2; i += 1) {
      const target = new ConditionPhotoP1OwnedTarget();
      await target.createDatabase();
      await target.createRole("fake-secret");
      await target.close();
      await target.close();
    }
    expect(creations()).toHaveLength(4);
    expect(drops()).toHaveLength(4);
    expect(drops().every((sql) => /vlt_t_(db|role)_215_/.test(sql))).toBe(true);
    expect(fake.databases.size).toBe(0);
    expect(fake.roles.size).toBe(0);
  });
});
