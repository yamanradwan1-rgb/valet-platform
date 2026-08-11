import { randomBytes, randomUUID } from "node:crypto";

import { staffLoginRequestSchema } from "@valet/contracts";
import argon2 from "argon2";
import { Client, type ClientConfig } from "pg";

import {
  migrationClientConfig,
  parseMigrationDatabaseUrl,
  verifyMigrationConnectionTls,
} from "../../../packages/database/scripts/database-connection-policy.mjs";
import { isAcceptedStaffPasswordHash } from "../src/modules/auth/staff-auth.service";

const acceptedRoles = [
  "ORG_ADMIN",
  "LOCATION_MANAGER",
  "VALET_SUPERVISOR",
  "VALET_EMPLOYEE",
] as const;
const acceptedEnvironments = new Set(["production", "development", "test"]);
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StaffProvisioningRole = (typeof acceptedRoles)[number];

export interface ProvisioningArguments {
  readonly auditLocationId: string;
  readonly email: string;
  readonly locationIds: readonly string[];
  readonly operatorRef: string;
  readonly organizationId: string;
  readonly passwordStdin: true;
  readonly reason: string;
  readonly role: StaffProvisioningRole;
}

export interface ProvisioningResult {
  readonly auditEventId: string;
  readonly locationIds: readonly string[];
  readonly membershipId: string;
  readonly organizationId: string;
  readonly role: StaffProvisioningRole;
  readonly userId: string;
}

interface DatabaseClient {
  connect(): Promise<unknown>;
  end(): Promise<void>;
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rowCount: number | null; readonly rows: Row[] }>;
}

interface ExecutionDependencies {
  readonly createClient: (configuration: ClientConfig) => DatabaseClient;
  readonly verifyTls: (
    client: DatabaseClient,
    nodeEnvironment: string,
  ) => Promise<void>;
}

export class StaffProvisioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffProvisioningError";
  }
}

function fail(message: string): never {
  throw new StaffProvisioningError(message);
}

export function parseProvisioningArguments(
  values: readonly string[],
): ProvisioningArguments {
  const singleton = new Map<string, string>();
  const locationIds: string[] = [];
  let passwordStdin = false;
  const singletonFlags = new Set([
    "--organization-id",
    "--audit-location-id",
    "--role",
    "--email",
    "--operator-ref",
    "--reason",
  ]);

  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (flag === undefined) fail("Invalid command input.");
    if (flag === "--password-stdin") {
      if (passwordStdin) fail("Duplicate command option.");
      passwordStdin = true;
      continue;
    }
    if (flag === "--location-id") {
      const value = values[index + 1];
      if (value === undefined || value.startsWith("--")) {
        fail("Missing command option value.");
      }
      locationIds.push(value);
      index += 1;
      continue;
    }
    if (!singletonFlags.has(flag)) fail("Unknown command option.");
    if (singleton.has(flag)) fail("Duplicate command option.");
    const value = values[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail("Missing command option value.");
    }
    singleton.set(flag, value);
    index += 1;
  }

  const required = (flag: string): string =>
    singleton.get(flag) ?? fail("Missing required command option.");
  const organizationId = requireUuid(
    required("--organization-id"),
    "Invalid Organization ID.",
  );
  const auditLocationId = requireUuid(
    required("--audit-location-id"),
    "Invalid audit Location ID.",
  );
  if (!passwordStdin) fail("Password input must be provided through stdin.");
  if (locationIds.length === 0) fail("At least one Location ID is required.");
  const normalizedLocations = locationIds.map((value) =>
    requireUuid(value, "Invalid Location ID."),
  );
  if (new Set(normalizedLocations).size !== normalizedLocations.length) {
    fail("Duplicate Location ID.");
  }
  normalizedLocations.sort();
  if (!normalizedLocations.includes(auditLocationId)) {
    fail("Audit Location must be one of the granted Locations.");
  }
  const role = required("--role");
  if (!acceptedRoles.includes(role as StaffProvisioningRole)) {
    fail("Invalid staff role.");
  }

  return {
    auditLocationId,
    email: required("--email"),
    locationIds: normalizedLocations,
    operatorRef: requireBoundedText(
      required("--operator-ref"),
      200,
      "Invalid operator reference.",
    ),
    organizationId,
    passwordStdin: true,
    reason: requireBoundedText(
      required("--reason"),
      500,
      "Invalid provisioning reason.",
    ),
    role: role as StaffProvisioningRole,
  };
}

function requireUuid(value: string, message: string): string {
  if (!uuidPattern.test(value)) fail(message);
  return value.toLowerCase();
}

function requireBoundedText(
  value: string,
  maximum: number,
  message: string,
): string {
  if (
    value.length === 0 ||
    Array.from(value).length > maximum ||
    /\p{Cc}/u.test(value)
  ) {
    fail(message);
  }
  return value;
}

export function requireNodeEnvironment(value: string | undefined): string {
  if (value === undefined || !acceptedEnvironments.has(value)) {
    fail(
      "NODE_ENV must be explicitly set to production, development, or test.",
    );
  }
  return value;
}

export function assertNonProductionLoopback(
  nodeEnvironment: string,
  hostname: string,
): void {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (nodeEnvironment !== "production" && !loopbackHosts.has(normalized)) {
    fail("Non-production provisioning requires a loopback database host.");
  }
}

export function passwordFromStdin(value: string, interactive: boolean): string {
  if (interactive) {
    fail("Provide the password through non-interactive standard input.");
  }
  const password = value.endsWith("\r\n")
    ? value.slice(0, -2)
    : value.endsWith("\n")
      ? value.slice(0, -1)
      : value;
  if (/[\r\n]/.test(password)) fail("Password must not contain line breaks.");
  const codePoints = Array.from(password).length;
  if (codePoints < 15 || codePoints > 128) {
    fail("Password must contain between 15 and 128 Unicode code points.");
  }
  if (Buffer.byteLength(password, "utf8") > 1024) {
    fail("Password exceeds the maximum UTF-8 size.");
  }
  return password;
}

export function normalizeProvisioningIdentity(
  email: string,
  password: string,
): { email: string; password: string } {
  const parsed = staffLoginRequestSchema.safeParse({ email, password });
  if (!parsed.success) fail("Invalid staff email or password.");
  return parsed.data;
}

export async function hashProvisioningPassword(
  password: string,
): Promise<string> {
  const passwordHash = await argon2.hash(password, {
    hashLength: 32,
    memoryCost: 65_536,
    parallelism: 4,
    salt: randomBytes(16),
    timeCost: 3,
    type: argon2.argon2id,
    version: 19,
  });
  if (!isAcceptedStaffPasswordHash(passwordHash)) {
    fail("Password hashing failed.");
  }
  return passwordHash;
}

export async function persistProvisionedStaff(
  client: DatabaseClient,
  input: ProvisioningArguments,
  normalizedEmail: string,
  passwordHash: string,
): Promise<ProvisioningResult> {
  const userId = randomUUID();
  const membershipId = randomUUID();
  const auditEventId = randomUUID();
  await client.query("BEGIN");
  try {
    const organization = await client.query<{ status: string }>(
      "SELECT status::text AS status FROM organizations WHERE id = $1 FOR SHARE",
      [input.organizationId],
    );
    if (organization.rows[0]?.status !== "ACTIVE") {
      fail("Organization is unavailable for provisioning.");
    }
    const locations = await client.query<{
      id: string;
      organization_id: string;
      status: string;
    }>(
      `SELECT id::text, organization_id::text, status::text
       FROM locations WHERE id = ANY($1::uuid[]) FOR SHARE`,
      [input.locationIds],
    );
    if (
      locations.rowCount !== input.locationIds.length ||
      locations.rows.some(
        (location) =>
          location.organization_id !== input.organizationId ||
          location.status !== "ACTIVE",
      )
    ) {
      fail("One or more Locations are unavailable for provisioning.");
    }
    const existing = await client.query(
      "SELECT 1 FROM users WHERE email = $1",
      [normalizedEmail],
    );
    if ((existing.rowCount ?? 0) !== 0) {
      fail("A User with this staff identity already exists.");
    }
    await client.query(
      `INSERT INTO users (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, $3, 'ACTIVE', transaction_timestamp())`,
      [userId, normalizedEmail, passwordHash],
    );
    await client.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', transaction_timestamp())`,
      [membershipId, input.organizationId, userId, input.role],
    );
    for (const locationId of input.locationIds) {
      await client.query(
        `INSERT INTO membership_location_access
           (organization_id, membership_id, location_id)
         VALUES ($1, $2, $3)`,
        [input.organizationId, membershipId, locationId],
      );
    }
    await client.query(
      `INSERT INTO audit_events
         (id, organization_id, location_id, valet_session_id,
          actor_membership_id, event_type, entity_type, entity_id,
          metadata_json, occurred_at)
       VALUES ($1, $2, $3, NULL, NULL, 'STAFF_ACCOUNT_PROVISIONED',
               'OrganizationMembership', $4, $5::jsonb,
               transaction_timestamp())`,
      [
        auditEventId,
        input.organizationId,
        input.auditLocationId,
        membershipId,
        JSON.stringify({
          locationIds: input.locationIds,
          operatorRef: input.operatorRef,
          provisioningBoundary: "CONTROLLED_OPERATOR",
          reason: input.reason,
          role: input.role,
        }),
      ],
    );
    await client.query("COMMIT");
    return {
      auditEventId,
      locationIds: input.locationIds,
      membershipId,
      organizationId: input.organizationId,
      role: input.role,
      userId,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the bounded provisioning failure.
    }
    if (error instanceof StaffProvisioningError) throw error;
    fail("Staff provisioning failed.");
  }
}

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

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readProvisioningPassword(
  interactive: boolean,
  read: () => Promise<string>,
): Promise<string> {
  if (interactive) {
    fail("Provide the password through non-interactive standard input.");
  }
  return passwordFromStdin(await read(), false);
}

async function main(): Promise<void> {
  try {
    const input = parseProvisioningArguments(process.argv.slice(2));
    const password = await readProvisioningPassword(
      process.stdin.isTTY === true,
      readStandardInput,
    );
    const result = await executeProvisioning(input, password, process.env);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const message =
      error instanceof StaffProvisioningError
        ? error.message
        : "Staff provisioning failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("provision-staff.ts")) {
  void main();
}
