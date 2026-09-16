import { Client } from "pg";

import {
  migrationClientConfig,
  parseMigrationDatabaseUrl,
  verifyMigrationConnectionTls,
} from "../../../../packages/database/scripts/database-connection-policy.mjs";
import {
  assertNonProductionLoopback,
  requireNodeEnvironment,
} from "../staff-provisioning/provisioning-input";
import { persistControlledSecurityDisable } from "./persistence";
import {
  ControlledSecurityDisableError,
  failSecurityDisable,
  type SecurityDisableArguments,
  type SecurityDisableDatabaseClient,
  type SecurityDisableExecutionDependencies,
  type SecurityDisableResult,
} from "./types";

export async function executeControlledSecurityDisable(
  input: SecurityDisableArguments,
  environment: NodeJS.ProcessEnv,
  dependencies: SecurityDisableExecutionDependencies = {
    createClient: (configuration) =>
      new Client(configuration) as unknown as SecurityDisableDatabaseClient,
    verifyTls: (client, nodeEnvironment) =>
      verifyMigrationConnectionTls(client as unknown as Client, nodeEnvironment),
  },
): Promise<SecurityDisableResult> {
  const nodeEnvironment = requireNodeEnvironment(environment.NODE_ENV);
  const migration = parseMigrationDatabaseUrl(
    environment.MIGRATION_DATABASE_URL,
    nodeEnvironment,
  );
  assertNonProductionLoopback(nodeEnvironment, migration.parsed.hostname);
  const client = dependencies.createClient(
    migrationClientConfig(migration, nodeEnvironment),
  );
  try {
    await client.connect();
    await dependencies.verifyTls(client, nodeEnvironment);
    return await persistControlledSecurityDisable(client, input);
  } catch (error) {
    if (error instanceof ControlledSecurityDisableError) throw error;
    return failSecurityDisable("Controlled Staff security disable failed.");
  } finally {
    try {
      await client.end();
    } catch {
      // Never replace the bounded result with connection details.
    }
  }
}
