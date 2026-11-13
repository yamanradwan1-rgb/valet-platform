// Synthetic-only Issue #416 PG17 fixture. Never accept a shared or default DB.
export const TARGET = Object.freeze({
  project: "vaylet-issue416-w9",
  container: "vaylet-issue416-w9-pg17",
  volume: "vaylet-issue416-w9-pg17-data",
  database: "issue416_w9_db",
  owner: "issue416_w9_owner",
  trustedMigrationRole: "issue416_w9_migration",
  port: "55416",
  image: "postgres:17-alpine",
  roles: Object.freeze({
    TEST_DATABASE_URL: ["issue416_w9_test", "fixture_w9_test_only"],
    MIGRATION_DATABASE_URL: ["issue416_w9_migration", "fixture_w9_migration_only"],
    DATABASE_URL: ["issue416_w9_runtime", "fixture_w9_runtime_only"],
  }),
});

function fail(reason) {
  throw new Error(`Issue416 isolated-PG17 preflight refused: ${reason}.`);
}

export function assertTargetEnvironment(env = process.env) {
  if (env.NODE_ENV === "production") fail("production process environment");
  if (env.CI || env.GITHUB_ACTIONS) fail("unattested CI environment");
  if (env.VAYLET_TEST_PROJECT && env.VAYLET_TEST_PROJECT !== "issue416-pg17-private") {
    fail("inherited unrelated test project");
  }
  if (env.VAYLET_POSTGRES_PROFILE || env.VAYLET_TEST_TARGET) {
    fail("inherited generic PostgreSQL harness identity");
  }

  for (const key of Object.keys(env)) {
    if (/^PG[A-Z0-9_]*$/i.test(key)) fail("inherited PG environment");
    if (/^(?:VAYLET_TEST_.*(?:RUN_ID|LEASE|OWNER)|VAYLET_.*_RUN_ID)$/i.test(key)) {
      fail("inherited test run or lease identity");
    }
  }

  const urls = {};
  for (const [name, [role, syntheticPassword]] of Object.entries(TARGET.roles)) {
    const value = env[name];
    if (typeof value !== "string" || value.trim() !== value || !value) {
      fail(`explicit ${name} is required`);
    }
    let url;
    try {
      url = new URL(value);
    } catch {
      fail(`malformed ${name}`);
    }
    let username;
    let password;
    try {
      username = decodeURIComponent(url.username);
      password = decodeURIComponent(url.password);
    } catch {
      fail(`invalid URL escaping for ${name}`);
    }
    if (url.protocol !== "postgresql:" ||
        url.hostname !== "127.0.0.1" || url.port !== TARGET.port ||
        url.pathname !== `/${TARGET.database}` ||
        username !== role || password !== syntheticPassword ||
        url.search || url.hash) {
      fail(`unexpected target for ${name}`);
    }
    urls[name] = value;
  }
  if (new Set(Object.values(urls)).size !== 3) fail("roles are not distinct");
  if (TARGET.roles.MIGRATION_DATABASE_URL[0] !== TARGET.trustedMigrationRole) {
    fail("privileged fixture migration principal drift");
  }
  return Object.freeze(urls);
}

export function sanitizedChildEnvironment(env = process.env) {
  const urls = assertTargetEnvironment(env);
  const preserved = ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "WINDIR",
    "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
    "ComSpec", "PATHEXT", "LANG"];
  const clean = Object.fromEntries(preserved
    .filter((key) => env[key] !== undefined)
    .map((key) => [key, env[key]]));
  return { ...clean, ...urls, NODE_ENV: "test" };
}
