import { Client } from "pg";

import {
  migrationClientConfig,
  parseMigrationDatabaseUrl,
  verifyMigrationConnectionTls,
} from "../../../../packages/database/scripts/database-connection-policy.mjs";
import {
  assertNonProductionLoopback,
  requireNodeEnvironment,
} from "./provisioning-input";
import {
  hashProvisioningPassword,
  normalizeProvisioningIdentity,
} from "./provisioning-password";
import { persistProvisionedStaff } from "./provisioning-persistence";
import {
  fail,
  StaffProvisioningError,
  type DatabaseClient,
  type ExecutionDependencies,
  type ProvisioningArguments,
  type ProvisioningResult,
} from "./types";

export async function executeProvisioning(
  input: ProvisioningArguments,
  password: string,
  environment: NodeJS.ProcessEnv,
  dependencies: ExecutionDependencies = {
    createClient: (configuration) =>
      new Client(configuration) as unknown as DatabaseClient,
    verifyTls: (client, nodeEnvironment) =>
      verifyMigrationConnectionTls(
        client as unknown as Client,
        nodeEnvironment,
      ),
  },
): Promise<ProvisioningResult> {
  const nodeEnvironment = requireNodeEnvironment(environment.NODE_ENV);
  const identity = normalizeProvisioningIdentity(input.email, password);
  const passwordHash = await hashProvisioningPassword(identity.password);
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
    return await persistProvisionedStaff(
      client,
      input,
      identity.email,
      passwordHash,
    );
  } catch (error) {
    if (error instanceof StaffProvisioningError) throw error;
    return fail("Staff provisioning failed.");
  } finally {
    try {
      await client.end();
    } catch {
      // Never replace the bounded command result with connection details.
    }
  }
}
