const LOCAL_LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export const REQUIRED_LOCAL_DATABASE_NAME = "valet";

export interface LocalDatabaseTarget {
  readonly database: string;
  readonly host: string;
}

export function assertLocalDevelopmentNodeEnvironment(
  nodeEnvironment: string | undefined,
): "development" {
  if (nodeEnvironment !== "development") {
    throw new Error(
      `VAYLET local tooling requires NODE_ENV to be exactly "development" ` +
        `(received ${
          nodeEnvironment === undefined ? "unset" : `"${nodeEnvironment}"`
        }). No destructive database action was performed.`,
    );
  }
  return nodeEnvironment;
}

function normalizeHost(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

export function isLocalLoopbackHost(hostname: string): boolean {
  return LOCAL_LOOPBACK_HOSTS.has(normalizeHost(hostname));
}

export function assertLocalDevelopmentDatabaseTarget(
  hostname: string,
  database: string,
): LocalDatabaseTarget {
  const host = normalizeHost(hostname);
  if (!LOCAL_LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `VAYLET local tooling refuses PostgreSQL host "${hostname}". ` +
        `Allowed hosts are localhost, 127.0.0.1 and ::1. ` +
        `No destructive database action was performed.`,
    );
  }
  if (database !== REQUIRED_LOCAL_DATABASE_NAME) {
    throw new Error(
      `VAYLET local tooling refuses database "${database}". ` +
        `The only allowed local development database is ` +
        `"${REQUIRED_LOCAL_DATABASE_NAME}". ` +
        `No destructive database action was performed.`,
    );
  }
  return { database, host };
}
