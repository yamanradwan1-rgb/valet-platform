import {
  acceptedRoles,
  fail,
  type ProvisioningArguments,
  type StaffProvisioningRole,
} from "./types";

const acceptedEnvironments = new Set(["production", "development", "test"]);
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    operatorRef: requireOperatorReference(required("--operator-ref")),
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

function requireOperatorReference(value: string): string {
  const reference = requireBoundedText(
    value,
    200,
    "Invalid operator reference.",
  );
  if (/[\s@]/u.test(reference)) fail("Invalid operator reference.");
  return reference;
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
