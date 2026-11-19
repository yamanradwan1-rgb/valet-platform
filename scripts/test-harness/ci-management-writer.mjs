import { basename } from "node:path";

// PostgreSQL passwords belong to the cluster role. Use one CI-job password
// and serialize provisioners on the common bootstrap database.
export async function prepareCiManagementWriter(pg) {
  const env = process.env;
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_JOB !== "postgres" ||
      env.NODE_ENV !== "test" ||
      basename(process.argv[1] ?? "") !== "provision-runtime-role.mjs" ||
      env.MANAGEMENT_WRITER_DATABASE_URL !== undefined) return;

  const bootstrap = new URL(env.VAYLET_CI_POSTGRES_BOOTSTRAP_URL);
  const runtime = new URL(env.DATABASE_URL);
  const migration = new URL(env.MIGRATION_DATABASE_URL);
  const password = env.VAYLET_CI_MANAGEMENT_WRITER_PASSWORD;
  if (!/^[a-f0-9]{64}$/.test(password ?? "") ||
      bootstrap.pathname !== "/valet" || bootstrap.username !== "valet" ||
      !["localhost", "127.0.0.1"].includes(bootstrap.hostname) ||
      bootstrap.protocol !== "postgresql:" ||
      [runtime, migration].some((url) => url.hostname !== bootstrap.hostname ||
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
    // The child exits after provisioning and PostgreSQL releases the session lock.
    lock.connection.stream.unref();
    runtime.username = "vaylet_management_writer";
    runtime.password = password;
    env.MANAGEMENT_WRITER_DATABASE_URL = runtime.toString();
  } catch {
    await lock.end().catch(() => undefined);
    throw new Error("Could not acquire PostgreSQL CI Management Writer fixture lock");
  }
}
