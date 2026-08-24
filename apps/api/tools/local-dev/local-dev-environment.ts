import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import dotenv from "dotenv";

import {
  decodedDatabaseIdentity,
  parseMigrationDatabaseUrl,
  parseRuntimeDatabaseUrlForProvisioning,
  type ParsedDatabaseConfiguration,
} from "../../../../packages/database/scripts/database-connection-policy.mjs";
import {
  assertLocalDevelopmentDatabaseTarget,
  assertLocalDevelopmentNodeEnvironment,
} from "./local-database-guard";

export const WORKSPACE_MARKER = "pnpm-workspace.yaml";

export const LOCAL_SERVICE_URLS = {
  api: "http://localhost:3001",
  customer: "http://localhost:3002",
  employee: "http://localhost:3000",
} as const;

export const LOCAL_EMPLOYEE_ORIGIN = LOCAL_SERVICE_URLS.employee;

export function findRepositoryRoot(startDirectory: string): string {
  let current = resolve(startDirectory);
  for (;;) {
    if (existsSync(join(current, WORKSPACE_MARKER))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(
        "VAYLET local tooling could not locate the pnpm workspace root.",
      );
    }
    current = parent;
  }
}

export function loadRepositoryDotEnv(repositoryRoot: string): string | false {
  const envPath = join(repositoryRoot, ".env");
  if (!existsSync(envPath)) {
    return false;
  }
  dotenv.config({ path: envPath, quiet: true });
  return envPath;
}

export interface ResolvedLocalEnvironment {
  readonly migration?: ParsedDatabaseConfiguration;
  readonly runtime: ParsedDatabaseConfiguration;
}

function resolveGuardedRuntime(
  environment: NodeJS.ProcessEnv,
): ParsedDatabaseConfiguration {
  const runtime = parseRuntimeDatabaseUrlForProvisioning(
    environment.DATABASE_URL,
  );
  assertLocalDevelopmentDatabaseTarget(
    decodedDatabaseIdentity(runtime).host,
    decodedDatabaseIdentity(runtime).database,
  );
  return runtime;
}

export function resolveStatusEnvironment(
  environment: NodeJS.ProcessEnv,
): ResolvedLocalEnvironment {
  assertLocalDevelopmentNodeEnvironment(environment.NODE_ENV);
  return { runtime: resolveGuardedRuntime(environment) };
}

export function resolveBootstrapEnvironment(
  environment: NodeJS.ProcessEnv,
): ResolvedLocalEnvironment {
  assertLocalDevelopmentNodeEnvironment(environment.NODE_ENV);
  const migration = parseMigrationDatabaseUrl(
    environment.MIGRATION_DATABASE_URL,
    "development",
  );
  const migrationIdentity = decodedDatabaseIdentity(migration);
  assertLocalDevelopmentDatabaseTarget(
    migrationIdentity.host,
    migrationIdentity.database,
  );
  return { migration, runtime: resolveGuardedRuntime(environment) };
}

export function loadStatusEnvironment(): ResolvedLocalEnvironment {
  const repositoryRoot = findRepositoryRoot(process.cwd());
  if (loadRepositoryDotEnv(repositoryRoot) === false) {
    throw new Error(
      "VAYLET local tooling requires a repository .env file. Copy .env.example and fill in local values.",
    );
  }
  return resolveStatusEnvironment(process.env);
}

export interface LoadedBootstrapContext {
  readonly repositoryRoot: string;
  readonly environment: Required<ResolvedLocalEnvironment>;
}

export function loadBootstrapEnvironment(): LoadedBootstrapContext {
  const repositoryRoot = findRepositoryRoot(process.cwd());
  if (loadRepositoryDotEnv(repositoryRoot) === false) {
    throw new Error(
      "VAYLET local tooling requires a repository .env file. Copy .env.example and fill in local values.",
    );
  }
  const resolved = resolveBootstrapEnvironment(process.env);
  if (resolved.migration === undefined) {
    throw new Error("Bootstrap requires MIGRATION_DATABASE_URL.");
  }
  return {
    environment: {
      migration: resolved.migration,
      runtime: resolved.runtime,
    },
    repositoryRoot,
  };
}
