import { join } from "node:path";

import { Client, type ClientConfig } from "pg";

import { migrationClientConfig } from "../../../../packages/database/scripts/database-connection-policy.mjs";
import {
  makeDemoEmployeeLoginCapable,
  LOCAL_SMOKE_EMPLOYEE_EMAIL,
  LOCAL_SMOKE_EMPLOYEE_PASSWORD,
  type DemoEmployeeCredentialResult,
} from "./demo-employee-credential";
import { purgeStaffAuthAndAntiAbuseState } from "./local-auth-state-reset";
import {
  loadBootstrapEnvironment,
  LOCAL_SERVICE_URLS,
} from "./local-dev-environment";
import {
  ensureLocalPostgresService,
  runPnpmCommand,
  waitForPostgresDatabase,
} from "./local-process-steps";
import {
  assertCanonicalFreeResources,
  classifyResourceRows,
  formatOccupancyLines,
  KEY_SLOT_OCCUPANCY_SQL,
  PARKING_SPOT_OCCUPANCY_SQL,
  toResourceOccupancyRows,
  type OccupancyClassification,
} from "./resource-status";

const CANONICAL_FREE_KEY_SLOTS = ["K-03", "K-04"] as const;

export interface BootstrapPurgeCounts {
  readonly antiAbuseEventsDeleted: number;
  readonly refreshCredentialsDeleted: number;
  readonly staffSessionsDeleted: number;
}

export interface BootstrapOutcome {
  readonly credential: DemoEmployeeCredentialResult;
  readonly keySlots: OccupancyClassification[];
  readonly parkingSpots: OccupancyClassification[];
  readonly purge: BootstrapPurgeCounts;
}

async function resetPublicSchema(migration: ClientConfig): Promise<void> {
  const client = new Client(migration);
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
}

async function withMigrationClient<T>(
  migration: ClientConfig,
  action: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(migration);
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.end();
  }
}

async function readOccupancy(runtimeConnectionString: string): Promise<{
  keySlots: OccupancyClassification[];
  parkingSpots: OccupancyClassification[];
}> {
  const client = new Client({ connectionString: runtimeConnectionString });
  await client.connect();
  try {
    const keySlots = await client.query(KEY_SLOT_OCCUPANCY_SQL);
    const parkingSpots = await client.query(PARKING_SPOT_OCCUPANCY_SQL);
    return {
      keySlots: classifyResourceRows(toResourceOccupancyRows(keySlots.rows)),
      parkingSpots: classifyResourceRows(
        toResourceOccupancyRows(parkingSpots.rows),
      ),
    };
  } finally {
    await client.end();
  }
}

export function renderBootstrapSummary(outcome: BootstrapOutcome): string[] {
  return [
    "VAYLET local environment ready",
    "",
    `API:       ${LOCAL_SERVICE_URLS.api}`,
    `Employee:  ${LOCAL_SERVICE_URLS.employee}`,
    `Customer:  ${LOCAL_SERVICE_URLS.customer}`,
    "",
    "Employee demo credential:",
    `  ${outcome.credential.email}`,
    `  ${LOCAL_SMOKE_EMPLOYEE_PASSWORD}`,
    "",
    `Purged auth state: ${outcome.purge.staffSessionsDeleted} staff sessions, ${outcome.purge.refreshCredentialsDeleted} refresh credentials, ${outcome.purge.antiAbuseEventsDeleted} anti-abuse events.`,
    "",
    "KeySlots:",
    ...formatOccupancyLines(outcome.keySlots),
    "",
    "Parking spots:",
    ...formatOccupancyLines(outcome.parkingSpots),
  ];
}

export async function runBootstrap(): Promise<BootstrapOutcome> {
  const { environment, repositoryRoot } = loadBootstrapEnvironment();
  const migrationConfig = migrationClientConfig(
    environment.migration,
    "development",
  );
  try {
    await waitForPostgresDatabase(migrationConfig, 2_000);
  } catch {
    ensureLocalPostgresService(repositoryRoot);
    await waitForPostgresDatabase(migrationConfig);
  }

  await resetPublicSchema(
    migrationClientConfig(environment.migration, "development"),
  );

  runPnpmCommand(
    repositoryRoot,
    ["--filter", "@valet/database", "run", "migrate:deploy"],
    "Prisma migrations",
  );
  runPnpmCommand(
    repositoryRoot,
    ["--filter", "@valet/database", "run", "runtime:provision"],
    "Runtime role provisioning",
  );
  runPnpmCommand(
    repositoryRoot,
    ["--filter", "@valet/database", "run", "seed"],
    "Canonical demo seed",
    {
      DATABASE_URL: environment.migration.value,
      VAYLET_ALLOW_DEMO_SEED: "true",
    },
  );

  const credential = await withMigrationClient(migrationConfig, (client) =>
    makeDemoEmployeeLoginCapable(
      client,
      LOCAL_SMOKE_EMPLOYEE_EMAIL,
      LOCAL_SMOKE_EMPLOYEE_PASSWORD,
    ),
  );
  const purge = await withMigrationClient(migrationConfig, (client) =>
    purgeStaffAuthAndAntiAbuseState(client),
  );

  const occupancy = await readOccupancy(environment.runtime.value);
  assertCanonicalFreeResources(occupancy.keySlots, CANONICAL_FREE_KEY_SLOTS);

  return {
    credential,
    keySlots: occupancy.keySlots,
    parkingSpots: occupancy.parkingSpots,
    purge,
  };
}

async function main(): Promise<void> {
  try {
    const outcome = await runBootstrap();
    for (const line of renderBootstrapSummary(outcome)) {
      process.stdout.write(`${line}\n`);
    }
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith(join("local-dev", "bootstrap.ts"))) {
  void main();
}
