// W38-owned disposable PG17; never any W9, Prime, W33 or W37 fixture.
export const ACCEPTANCE_TARGET = Object.freeze({
  host: "127.0.0.1",
  port: 51138,
  container: "vaylet-issue416-w38-20261114-pg17",
  containerId: "14edf2d6904c88e677032fd43162fee1ed640f1c175301048ca49ebb50d2d351",
  database: "issue416_w38_db",
  owner: "issue416_w38_owner",
  login: "issue416_w38_test",
  runtime: "issue416_w38_runtime",
  marker: "VAYLET_416_W38_DISPOSABLE_PG17_20261114",
});

const PASSWORD_KEY = "ISSUE416_W38_ACCEPTANCE_PG_PASSWORD";
const DENIED_ENVIRONMENT = /^(?:PG[A-Z0-9_]*|DATABASE_URL|TEST_DATABASE_URL|MIGRATION_DATABASE_URL|DIRECT_URL|VAYLET_TEST_.*|VAYLET_POSTGRES_.*)$/i;

export function assertAcceptanceEnvironment(env = process.env) {
  if (env.NODE_ENV === "production" || env.CI || env.GITHUB_ACTIONS) {
    throw new Error("W30_PG17_REFUSED_NONLOCAL_ENVIRONMENT");
  }
  if (Reflect.ownKeys(env).some((key) => typeof key !== "string" ||
    (DENIED_ENVIRONMENT.test(key) && env[key] !== undefined))) {
    throw new Error("W30_PG17_REFUSED_INHERITED_DATABASE_TARGET");
  }
  const keys = Reflect.ownKeys(env);
  if (keys.some((key) => typeof key !== "string")) {
    throw new Error("W30_PG17_REFUSED_ENVIRONMENT_SHAPE");
  }
  const password = Object.getOwnPropertyDescriptor(env, PASSWORD_KEY);
  if (!password || !Object.hasOwn(password, "value") ||
      typeof password.value !== "string" ||
      !/^[A-Za-z0-9_-]{16,100}$/.test(password.value)) {
    throw new Error("W30_PG17_MISSING_EXPLICIT_FIXTURE_PASSWORD");
  }
  return Object.freeze({
    ...ACCEPTANCE_TARGET,
    password: password.value,
  });
}

export function assertAcceptanceIdentity(row, target = ACCEPTANCE_TARGET) {
  if (!row || row.database !== target.database ||
    row.database_owner !== target.owner || row.actor !== target.login ||
    row.session_role !== target.login || row.marker !== target.marker ||
    row.server_port !== 5432 ||
    !Number.isInteger(row.server_version) ||
    row.server_version < 170000 || row.server_version >= 180000 ||
    row.recovery !== false || row.is_superuser !== false ||
    row.can_create_role !== false || row.can_create_db !== false ||
    row.bypass_rls !== false || row.can_replicate !== false ||
    row.owner_member !== false || row.can_create_schema !== false ||
    row.transaction_isolation !== "read committed" ||
    row.transaction_read_only !== "on" ||
    !Number.isInteger(row.backend_pid) || row.backend_pid < 1 ||
    typeof row.server_started !== "string" || !row.server_started) {
    throw new Error("W30_PG17_FIXTURE_IDENTITY_FAILED");
  }
  return Object.freeze({
    backendPid: row.backend_pid,
    serverStarted: row.server_started,
  });
}
