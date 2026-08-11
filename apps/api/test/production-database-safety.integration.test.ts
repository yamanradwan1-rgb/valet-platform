import { randomBytes, randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  assertProductionRuntimeRoleSafety,
  inspectRuntimeDatabaseSafety,
  verifyProductionRuntimeDatabaseSafety,
} from "../src/common/database/postgres";
import { RuntimeDatabaseLifecycle } from "../src/common/database/runtime-database.module";

const adminDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${randomBytes(4).toString("hex")}`;
const databaseName = `valet_004n_runtime_${suffix}`;
const runtimeRole = `valet_runtime_004n_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const safeIdentifier = /^[a-z_][a-z0-9_]{0,62}$/;

let adminPool: Pool;
let databaseCreated = false;
let roleCreated = false;
let runtimePool: Pool;
let testAdminUrl: string;
let testRuntimeUrl: string;

function databaseUrlFor(database: string): string {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${database}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function runtimeUrlFor(database: string): string {
  const url = new URL(databaseUrlFor(database));
  url.username = runtimeRole;
  url.password = runtimePassword;
  return url.toString();
}

beforeAll(async () => {
  expect(runtimeRole).toMatch(safeIdentifier);
  const bootstrap = new Pool({ connectionString: adminDatabaseUrl });
  try {
    await bootstrap.query(
      `CREATE ROLE "${runtimeRole}"
       WITH LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB
            NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    roleCreated = true;
    await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
  } finally {
    await bootstrap.end();
  }
  testAdminUrl = databaseUrlFor(databaseName);
  testRuntimeUrl = runtimeUrlFor(databaseName);
  adminPool = new Pool({ connectionString: testAdminUrl });
  await adminPool.query(
    `REVOKE CREATE ON DATABASE "${databaseName}" FROM PUBLIC`,
  );
  await adminPool.query(
    `REVOKE CREATE ON DATABASE "${databaseName}" FROM "${runtimeRole}"`,
  );
  await adminPool.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
  await adminPool.query(`REVOKE ALL ON SCHEMA public FROM "${runtimeRole}"`);
  await adminPool.query(`GRANT USAGE ON SCHEMA public TO "${runtimeRole}"`);
  runtimePool = new Pool({ connectionString: testRuntimeUrl });
}, 30_000);

afterAll(async () => {
  await runtimePool?.end();
  await adminPool?.end();
  const bootstrap = new Pool({ connectionString: adminDatabaseUrl });
  try {
    if (databaseCreated) {
      await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    }
    if (roleCreated) {
      await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
    }
  } finally {
    await bootstrap.end();
  }
}, 30_000);

describe("production runtime database safety verification", () => {
  it("closes its single injected runtime pool on shutdown", async () => {
    const end = vi.fn(async () => undefined);
    const lifecycle = new RuntimeDatabaseLifecycle({ end } as unknown as Pool);
    await lifecycle.onApplicationShutdown();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("accepts the real least-privilege role capability boundary", async () => {
    const safety = await inspectRuntimeDatabaseSafety(runtimePool);
    expect(() => assertProductionRuntimeRoleSafety(safety)).not.toThrow();
  });

  it("rejects the real plaintext PostgreSQL backend", async () => {
    await expect(
      verifyProductionRuntimeDatabaseSafety(runtimePool),
    ).rejects.toThrow("not securely encrypted");
  });

  it("fails the production application lifecycle before readiness on plaintext", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await expect(
        new RuntimeDatabaseLifecycle(runtimePool).onApplicationBootstrap(),
      ).rejects.toThrow("not securely encrypted");
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it.each([
    ["SUPERUSER", "NOSUPERUSER"],
    ["CREATEDB", "NOCREATEDB"],
    ["CREATEROLE", "NOCREATEROLE"],
    ["REPLICATION", "NOREPLICATION"],
    ["BYPASSRLS", "NOBYPASSRLS"],
  ])("rejects a real runtime role with %s", async (unsafe, safe) => {
    await adminPool.query(`ALTER ROLE "${runtimeRole}" ${unsafe}`);
    try {
      const safety = await inspectRuntimeDatabaseSafety(runtimePool);
      expect(() => assertProductionRuntimeRoleSafety(safety)).toThrow(
        "runtime role is unsafe",
      );
    } finally {
      await adminPool.query(`ALTER ROLE "${runtimeRole}" ${safe}`);
    }
  });

  it("rejects current-database ownership", async () => {
    const original = await adminPool.query<{ owner: string }>(
      `SELECT pg_get_userbyid(datdba) AS owner
       FROM pg_database WHERE datname = current_database()`,
    );
    const originalOwner = original.rows[0]?.owner;
    expect(originalOwner).toMatch(safeIdentifier);
    await adminPool.query(
      `ALTER DATABASE "${databaseName}" OWNER TO "${runtimeRole}"`,
    );
    try {
      const safety = await inspectRuntimeDatabaseSafety(runtimePool);
      expect(() => assertProductionRuntimeRoleSafety(safety)).toThrow(
        "runtime role is unsafe",
      );
    } finally {
      await adminPool.query(
        `ALTER DATABASE "${databaseName}" OWNER TO "${originalOwner}"`,
      );
    }
  });

  it("rejects public-schema ownership", async () => {
    const original = await adminPool.query<{ owner: string }>(
      `SELECT pg_get_userbyid(nspowner) AS owner
       FROM pg_namespace WHERE nspname = 'public'`,
    );
    const originalOwner = original.rows[0]?.owner;
    expect(originalOwner).toMatch(safeIdentifier);
    await adminPool.query(`ALTER SCHEMA public OWNER TO "${runtimeRole}"`);
    try {
      const safety = await inspectRuntimeDatabaseSafety(runtimePool);
      expect(() => assertProductionRuntimeRoleSafety(safety)).toThrow(
        "runtime role is unsafe",
      );
    } finally {
      await adminPool.query(`ALTER SCHEMA public OWNER TO "${originalOwner}"`);
    }
  });

  it("rejects CREATE capability on the current database", async () => {
    await adminPool.query(
      `GRANT CREATE ON DATABASE "${databaseName}" TO "${runtimeRole}"`,
    );
    try {
      const safety = await inspectRuntimeDatabaseSafety(runtimePool);
      expect(() => assertProductionRuntimeRoleSafety(safety)).toThrow(
        "runtime role is unsafe",
      );
    } finally {
      await adminPool.query(
        `REVOKE CREATE ON DATABASE "${databaseName}" FROM "${runtimeRole}"`,
      );
    }
  });

  it("rejects CREATE capability on the public schema", async () => {
    await adminPool.query(`GRANT CREATE ON SCHEMA public TO "${runtimeRole}"`);
    try {
      const safety = await inspectRuntimeDatabaseSafety(runtimePool);
      expect(() => assertProductionRuntimeRoleSafety(safety)).toThrow(
        "runtime role is unsafe",
      );
    } finally {
      await adminPool.query(
        `REVOKE CREATE ON SCHEMA public FROM "${runtimeRole}"`,
      );
    }
  });

  it.each(["TABLE", "SEQUENCE", "FUNCTION"])(
    "rejects ownership of a public application %s",
    async (kind) => {
      const name = `runtime_owned_${kind.toLowerCase()}_${suffix}`;
      expect(name).toMatch(safeIdentifier);
      if (kind === "TABLE") {
        await adminPool.query(`CREATE TABLE "${name}" (id integer)`);
        await adminPool.query(
          `ALTER TABLE "${name}" OWNER TO "${runtimeRole}"`,
        );
      } else if (kind === "SEQUENCE") {
        await adminPool.query(`CREATE SEQUENCE "${name}"`);
        await adminPool.query(
          `ALTER SEQUENCE "${name}" OWNER TO "${runtimeRole}"`,
        );
      } else {
        await adminPool.query(
          `CREATE FUNCTION "${name}"() RETURNS integer
           LANGUAGE sql AS 'SELECT 1'`,
        );
        await adminPool.query(
          `ALTER FUNCTION "${name}"() OWNER TO "${runtimeRole}"`,
        );
      }
      try {
        const safety = await inspectRuntimeDatabaseSafety(runtimePool);
        expect(() => assertProductionRuntimeRoleSafety(safety)).toThrow(
          "runtime role is unsafe",
        );
      } finally {
        if (kind === "TABLE") await adminPool.query(`DROP TABLE "${name}"`);
        else if (kind === "SEQUENCE")
          await adminPool.query(`DROP SEQUENCE "${name}"`);
        else await adminPool.query(`DROP FUNCTION "${name}"()`);
      }
    },
  );
});
