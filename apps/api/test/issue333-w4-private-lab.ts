import { Pool } from "pg";
import { expect } from "vitest";

import type { ManagementVisitContactTestFixture } from "./management-visit-contact-test-fixture";

export async function startIssue333W4PrivateLab(
  fixture: ManagementVisitContactTestFixture,
  onBeforeFixtureStart: () => void,
) {
  const url = process.env.TEST_DATABASE_URL ?? "";
  const directory = process.env.ISSUE333_W4_PRIVATE_DATADIR?.replaceAll(
    "\\",
    "/",
  );
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new Error("W4 requires an owned, disposable PostgreSQL URL.");
  }
  if (
    process.platform !== "win32" ||
    process.env.ISSUE333_W4_PRIVATE_PG !== "I_OWN_W4_CLUSTER" ||
    process.env.CI === "true" ||
    url !== process.env.MIGRATION_DATABASE_URL ||
    target.protocol !== "postgresql:" ||
    target.hostname !== "127.0.0.1" ||
    target.username !== "issue333_w4_owner" ||
    target.pathname !== "/postgres" ||
    !target.password ||
    target.search ||
    target.hash ||
    Number(target.port) < 1024 ||
    [5432, 55449].includes(Number(target.port)) ||
    !directory?.includes("/tmp/issue-333-w4-private/issue333w4-") ||
    !directory.endsWith("/.issue333-w4-private-cluster")
  ) {
    throw new Error(
      "W4 requires an explicitly owned disposable PostgreSQL cluster.",
    );
  }
  const owner = new Pool({ connectionString: url });
  try {
    const identity = await owner.query(
      `SELECT current_database() AS db, current_user AS owner,
              inet_server_port() AS port, current_setting('data_directory') AS directory,
              current_setting('server_version_num')::integer AS version`,
    );
    expect(identity.rows[0]).toMatchObject({
      db: "postgres",
      owner: "issue333_w4_owner",
      port: Number(target.port),
    });
    expect(identity.rows[0]?.directory.replaceAll("\\", "/")).toBe(directory);
    expect(identity.rows[0]?.version).toBeGreaterThanOrEqual(170000);
    expect(identity.rows[0]?.version).toBeLessThan(180000);
    console.log(
      "ISSUE333_W4_PRIVATE_OWNER_VERIFIED",
      JSON.stringify({
        db: identity.rows[0]?.db,
        owner: identity.rows[0]?.owner,
        port: identity.rows[0]?.port,
      }),
    );
  } finally {
    await owner.end();
  }
  onBeforeFixtureStart();
  await fixture.start();
  const runtime = new Pool({ connectionString: fixture.runtimeDatabaseUrl() });
  try {
    const identity = await runtime.query(
      `SELECT current_user AS role, rolsuper, rolcreatedb, rolcreaterole
       FROM pg_roles WHERE rolname = current_user`,
    );
    expect(identity.rows[0]).toMatchObject({
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
    });
    console.log("ISSUE333_W4_RUNTIME_ROLE_VERIFIED");
  } finally {
    await runtime.end();
  }
}
