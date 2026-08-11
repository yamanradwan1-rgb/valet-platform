import { readFileSync } from "node:fs";
import { posix, win32 } from "node:path";

const postgresProtocols = new Set(["postgres:", "postgresql:"]);
const productionMigrationKeys = new Set([
  "sslaccept",
  "sslmode",
  "sslrootcert",
]);
const acceptedTlsVersions = new Set(["TLSv1.2", "TLSv1.3"]);

function isAbsoluteFilesystemPath(value) {
  return posix.isAbsolute(value) || win32.isAbsolute(value);
}

function requireDatabaseUrl(value, name) {
  if (value === undefined || value.trim() === "") {
    throw new Error(`Database configuration requires ${name}.`);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Database configuration requires a valid ${name}.`);
  }
  if (!postgresProtocols.has(parsed.protocol)) {
    throw new Error(`Database configuration requires a PostgreSQL ${name}.`);
  }
  if (parsed.hash !== "") {
    throw new Error(
      `Runtime-role provisioning does not allow URL fragments in ${name}.`,
    );
  }
  if (parsed.username === "") {
    throw new Error(`Database configuration requires a username in ${name}.`);
  }
  if (parsed.password === "") {
    throw new Error(`Database configuration requires a password in ${name}.`);
  }
  if (parsed.hostname === "") {
    throw new Error(`Database configuration requires a host in ${name}.`);
  }
  if (parsed.pathname.length <= 1) {
    throw new Error(`Database configuration requires a database in ${name}.`);
  }
  return parsed;
}

function decoded(value, category) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`Database configuration contains an invalid ${category}.`);
  }
}

function validateProductionMigrationQuery(parsed) {
  const seen = new Set();
  for (const [key] of parsed.searchParams) {
    if (!productionMigrationKeys.has(key)) {
      throw new Error(
        "Production MIGRATION_DATABASE_URL contains a non-allowlisted query parameter.",
      );
    }
    if (seen.has(key)) {
      throw new Error(
        "Production MIGRATION_DATABASE_URL contains a duplicate query parameter.",
      );
    }
    seen.add(key);
  }
  const rootCertificatePath = parsed.searchParams.get("sslrootcert");
  if (
    rootCertificatePath !== null &&
    (rootCertificatePath.trim() === "" ||
      !isAbsoluteFilesystemPath(rootCertificatePath))
  ) {
    throw new Error(
      "Production MIGRATION_DATABASE_URL requires an absolute sslrootcert path.",
    );
  }
  if (parsed.searchParams.get("sslmode") !== "require") {
    throw new Error(
      "Production MIGRATION_DATABASE_URL requires sslmode=require.",
    );
  }
  if (parsed.searchParams.get("sslaccept") !== "strict") {
    throw new Error(
      "Production MIGRATION_DATABASE_URL requires sslaccept=strict.",
    );
  }
}

export function parseMigrationDatabaseUrl(
  value,
  nodeEnv = process.env.NODE_ENV,
) {
  const parsed = requireDatabaseUrl(value, "MIGRATION_DATABASE_URL");
  if (nodeEnv === "production") {
    validateProductionMigrationQuery(parsed);
  } else if (parsed.search !== "") {
    throw new Error(
      "Runtime-role provisioning does not allow query parameters in MIGRATION_DATABASE_URL.",
    );
  }
  return { parsed, value };
}

export function parseRuntimeDatabaseUrlForProvisioning(value) {
  const parsed = requireDatabaseUrl(value, "DATABASE_URL");
  if (parsed.search !== "") {
    throw new Error(
      "Runtime-role provisioning does not allow query parameters in DATABASE_URL.",
    );
  }
  return { parsed, value };
}

export function migrationClientConfig(
  migration,
  nodeEnv = process.env.NODE_ENV,
  readCertificate = readFileSync,
) {
  const { parsed } = migration;
  const config = {
    database: decoded(parsed.pathname.slice(1), "migration database name"),
    host: parsed.hostname.replace(/^\[|\]$/g, ""),
    password: decoded(parsed.password, "migration password"),
    port: parsed.port === "" ? 5432 : Number.parseInt(parsed.port, 10),
    user: decoded(parsed.username, "migration role name"),
  };
  if (nodeEnv !== "production") return config;

  const rootCertificatePath = parsed.searchParams.get("sslrootcert");
  let ca;
  if (rootCertificatePath !== null) {
    try {
      ca = readCertificate(rootCertificatePath, "utf8");
    } catch {
      throw new Error("Production migration TLS CA material is unavailable.");
    }
    if (ca.trim() === "") {
      throw new Error("Production migration TLS CA material is invalid.");
    }
  }
  return {
    ...config,
    ssl:
      ca === undefined
        ? { rejectUnauthorized: true }
        : { ca, rejectUnauthorized: true },
  };
}

export async function verifyMigrationConnectionTls(
  client,
  nodeEnv = process.env.NODE_ENV,
) {
  if (nodeEnv !== "production") return;
  let result;
  try {
    result = await client.query(
      `SELECT ssl, version
       FROM pg_stat_ssl
       WHERE pid = pg_backend_pid()`,
    );
  } catch {
    throw new Error("Production migration TLS verification failed.");
  }
  const row = result.rows[0];
  if (
    result.rowCount !== 1 ||
    row?.ssl !== true ||
    typeof row.version !== "string" ||
    !acceptedTlsVersions.has(row.version)
  ) {
    throw new Error("Production migration connection is not securely encrypted.");
  }
}

export function decodedDatabaseIdentity(configuration) {
  return {
    database: decoded(
      configuration.parsed.pathname.slice(1),
      "database name",
    ),
    host: configuration.parsed.hostname.toLowerCase(),
    password: decoded(configuration.parsed.password, "database password"),
    port: configuration.parsed.port || "5432",
    role: decoded(configuration.parsed.username, "database role name"),
  };
}

export function assertDatabaseCredentialSeparation(
  migration,
  runtime,
  nodeEnv = process.env.NODE_ENV,
) {
  const migrationIdentity = decodedDatabaseIdentity(migration);
  const runtimeIdentity = decodedDatabaseIdentity(runtime);
  if (migrationIdentity.role === runtimeIdentity.role) {
    throw new Error("Migration and runtime database roles must be distinct.");
  }
  if (
    nodeEnv === "production" &&
    migrationIdentity.password === runtimeIdentity.password
  ) {
    throw new Error(
      "Production migration and runtime database passwords must be distinct.",
    );
  }
}
