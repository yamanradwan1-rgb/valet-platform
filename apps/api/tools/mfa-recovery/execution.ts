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
import { persistControlledMfaRecovery } from "./persistence";
import {
  ControlledMfaRecoveryError,
  failMfaRecovery,
  type MfaRecoveryArguments,
  type MfaRecoveryExecutionDependencies,
  type MfaRecoveryResult,
  type RecoveryDatabaseClient,
} from "./types";

export async function executeControlledMfaRecovery(
  input: MfaRecoveryArguments,
  environment: NodeJS.ProcessEnv,
  dependencies: MfaRecoveryExecutionDependencies = {
    createClient: (configuration) =>
      new Client(configuration) as unknown as RecoveryDatabaseClient,
    verifyTls: (client, nodeEnvironment) =>
      verifyMigrationConnectionTls(client as unknown as Client, nodeEnvironment),
  },
): Promise<MfaRecoveryResult> {
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
    return await persistControlledMfaRecovery(client, input);
  } catch (error) {
    if (error instanceof ControlledMfaRecoveryError) throw error;
    return failMfaRecovery("Controlled MFA recovery failed.");
  } finally {
    try {
      await client.end();
    } catch {
      // Never replace the bounded result with connection details.
    }
  }
}
