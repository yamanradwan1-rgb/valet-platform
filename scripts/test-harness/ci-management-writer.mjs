import { basename } from "node:path";
import process from "node:process";
import { URL } from "node:url";

function assertUnreachableProvisionProbe(env, bootstrap, runtime, migration) {
  let writer;
  try {
    writer = new URL(env.MANAGEMENT_WRITER_DATABASE_URL ?? "");
  } catch {
    throw new Error("Invalid unreachable runtime provisioning probe");
  }
  const targets = [runtime, migration, writer];
  if (
    !/^\/valet_004b_db_[a-z0-9_]+$/.test(runtime.pathname) ||
    targets.some((url) =>
      url.protocol !== bootstrap.protocol ||
      url.hostname !== bootstrap.hostname ||
      url.port !== "1" ||
      url.pathname !== runtime.pathname
    ) ||
    writer.username !== "vaylet_management_writer" ||
    !writer.password || writer.search || writer.hash ||
    writer.password === runtime.password ||
    writer.password === migration.password
  ) {
    throw new Error("Invalid unreachable runtime provisioning probe");
  }
}

// PostgreSQL passwords belong to the cluster role. Use one CI-job password
// and serialize provisioners on the common bootstrap database.
export async function prepareCiManagementWriter(
  pg, env = process.env, scriptPath = process.argv[1],
) {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_JOB !== "postgres" ||
      env.NODE_ENV !== "test" ||
      basename(scriptPath ?? "") !== "provision-runtime-role.mjs") return;

  const bootstrap = new URL(env.VAYLET_CI_POSTGRES_BOOTSTRAP_URL);
  const runtime = new URL(env.DATABASE_URL);
  const migration = new URL(env.MIGRATION_DATABASE_URL);
  const password = env.VAYLET_CI_MANAGEMENT_WRITER_PASSWORD;
  if (!/^[a-f0-9]{64}$/.test(password ?? "") ||
      bootstrap.pathname !== "/valet" || bootstrap.username !== "valet" ||
      !["localhost", "127.0.0.1"].includes(bootstrap.hostname) ||
      bootstrap.protocol !== "postgresql:") {
    throw new Error("Invalid PostgreSQL CI Management Writer fixture");
  }
  // Negative tests deliberately use unreachable loopback URLs. Do not run
  // database setup before the real provisioner can validate those inputs.
  if (env.VAYLET_CI_RUNTIME_PROVISION_UNREACHABLE_PROBE === "1") {
    assertUnreachableProvisionProbe(env, bootstrap, runtime, migration);
    return;
  }
  if ([runtime, migration].some((url) => url.hostname !== bootstrap.hostname ||
        (url.port || "5432") !== (bootstrap.port || "5432") ||
        url.protocol !== bootstrap.protocol) ||
      runtime.pathname !== migration.pathname) {
    throw new Error("Invalid PostgreSQL CI Management Writer fixture");
  }

  const lock = new pg.Client({ connectionString: bootstrap.toString(), connectionTimeoutMillis: 5000 });
  try {
    await lock.connect();
    await lock.query("SET statement_timeout = '60s'");
    await lock.query("SELECT pg_advisory_lock(hashtext('vaylet-ci-management-writer'))");
  } catch {
    await lock.end().catch(() => undefined);
    throw new Error("Could not acquire PostgreSQL CI Management Writer fixture lock");
  }

  try {
    const { provisionS04ProofKey } = await import("../../packages/database/scripts/provision-s04-proof-key.mjs");
    await provisionS04ProofKey(env);
    // The child exits after provisioning and PostgreSQL releases the session lock.
    lock.connection.stream.unref();
    if (env.MANAGEMENT_WRITER_DATABASE_URL === undefined) {
      runtime.username = "vaylet_management_writer";
      runtime.password = password;
      env.MANAGEMENT_WRITER_DATABASE_URL = runtime.toString();
    }
  } catch {
    await lock.end().catch(() => undefined);
    throw new Error("Could not provision the S04 proof key for the PostgreSQL CI fixture");
  }
}
