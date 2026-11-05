/** Explicit production-child allowlist. Never inherit the QA process env. */
export function issue429ProductionChildEnvironment({
  systemEnvironment = {},
  port,
  runtimeUrl,
  databaseCa,
  mockEndpoint,
  token,
  caPath,
}) {
  const safeSystem = {};
  for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP"]) {
    if (typeof systemEnvironment[key] === "string" &&
        systemEnvironment[key].length > 0) {
      safeSystem[key] = systemEnvironment[key];
    }
  }
  const env = {
    ...safeSystem,
    NODE_ENV: "production",
    PORT: String(port),
    DATABASE_URL: runtimeUrl,
    DATABASE_TLS_CA_PEM: databaseCa,
    DATABASE_POOL_MAX: "2",
    DATABASE_ALLOWED_CONNECTIONS: "10",
    DATABASE_RESERVED_CONNECTIONS: "2",
    DATABASE_MAX_API_INSTANCES: "2",
    DATABASE_POOL_MAX_WAITERS: "64",
    DATABASE_GENERAL_LOCK_MS: "2000",
    DATABASE_GENERAL_STATEMENT_MS: "3000",
    DATABASE_GENERAL_TRANSACTION_MS: "5000",
    DATABASE_GENERAL_IDLE_TRANSACTION_MS: "2000",
    PLATE_OCR_ENDPOINT: mockEndpoint,
    PLATE_OCR_TOKEN: token,
    PLATE_OCR_MIN_SCORE: "0.8",
    PLATE_OCR_TIMEOUT_MS: "4000",
    NODE_EXTRA_CA_CERTS: caPath,
    VAYLET_LOCAL_DISABLE_MFA: "false",
    // Authenticated synthetic OCR needs no Staff Push or paid messaging.
    STAFF_PUSH_ACTIVE_REGISTRATION_STALE_DAYS: "30",
    STAFF_PUSH_CLEANUP_INTERVAL_HOURS: "24",
    STAFF_PUSH_RETRIEVAL_CREATION_ENABLED: "false",
    STAFF_PUSH_RETRIEVAL_INTENT_TTL_SECONDS: "300",
    STAFF_PUSH_RETRIEVAL_MAX_ATTEMPTS: "4",
    STAFF_PUSH_RETRIEVAL_POLICY_VERSION: "1",
    STAFF_PUSH_INTENT_DELIVERY_RETENTION_DAYS: "7",
    STAFF_PUSH_LEASE_DURATION_SECONDS: "30",
    STAFF_PUSH_PROVIDER_CALL_TIMEOUT_SECONDS: "10",
    STAFF_PUSH_RETRY_CAP_SECONDS: "60",
    STAFF_PUSH_RETRY_MINIMUM_SECONDS: "10",
    STAFF_PUSH_WORKER_SENDING_ENABLED: "false",
    STAFF_PUSH_TERMINAL_REGISTRATION_RETENTION_DAYS: "30",
  };
  if (!Number.isInteger(port) || port <= 1024 || port > 65535 ||
      !runtimeUrl || !databaseCa || !mockEndpoint.startsWith("https://127.0.0.1:") ||
      !token.startsWith("issue429-synthetic-") || !caPath) {
    throw new Error("Issue429 QA production-child inputs are incomplete or unsafe.");
  }
  return env;
}
