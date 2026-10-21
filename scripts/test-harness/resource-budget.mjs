export const DEFAULT_NON_TEST_ALLOWANCE = 20;
export const POSTGRES_RESOURCE_PROFILES = Object.freeze({
  "api-standard": profile("api-standard", 4, 2, 2, 1, 10, 1),
  "api-compound": profile("api-compound", 4, 3, 2, 1, 10, 1),
  "api-race": profile("api-race", 6, 4, 4, 1, 10, 2),
  // One isolated Next subprocess plus one Chromium process, no parallel files.
  "api-photo-browser": profile("api-photo-browser", 6, 4, 4, 2, 20, 1),
  "database-direct": profile("database-direct", 4, 2, 3, 0, 0, 2),
  "database-provision": profile("database-provision", 4, 2, 3, 1, 10, 2),
});

const PROJECT_PROFILES = Object.freeze({
  "api-postgres-standard": "api-standard",
  "api-postgres-compound": "api-compound",
  "api-postgres-race": "api-race",
  "api-postgres-issue215": "api-race",
  "api-postgres-issue309-browser": "api-photo-browser",
  "database-postgres-direct": "database-direct",
  "database-postgres-provision": "database-provision",
  "database-postgres-issue215": "database-provision",
});

function profile(
  name,
  poolMax,
  poolCount,
  directClients,
  subprocessMax,
  subprocessReserve,
  fileWorkers,
) {
  return Object.freeze({
    name,
    poolMax,
    poolCount,
    directClients,
    fileWorkers,
    subprocessMax,
    subprocessReserve,
    connectionEnvelope: poolMax * poolCount + directClients + subprocessReserve,
  });
}

export function postgresProfile(name) {
  const value = POSTGRES_RESOURCE_PROFILES[name];
  if (value === undefined) {
    throw new Error(
      `Unknown PostgreSQL test resource profile: ${String(name)}.`,
    );
  }
  return value;
}

export function postgresProfileForProject(projectName) {
  const profileName = PROJECT_PROFILES[projectName];
  if (profileName === undefined) {
    throw new Error(
      `Vitest project ${String(projectName)} has no PostgreSQL resource profile.`,
    );
  }
  return postgresProfile(profileName);
}

export function calculatePostgresBudget({
  maxConnections,
  nonTestAllowance = DEFAULT_NON_TEST_ALLOWANCE,
  profile: resourceProfile,
  reservedConnections = 0,
  superuserReservedConnections,
  workers,
}) {
  for (const [name, value] of Object.entries({
    maxConnections,
    nonTestAllowance,
    reservedConnections,
    superuserReservedConnections,
    workers,
  })) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(
        `Invalid PostgreSQL budget value ${name}=${String(value)}.`,
      );
    }
  }
  if (workers < 1)
    throw new Error("PostgreSQL test workers must be at least 1.");

  const reservedSlots = reservedConnections + superuserReservedConnections;
  const availableForTests = maxConnections - reservedSlots - nonTestAllowance;
  const admittedConnections = workers * resourceProfile.connectionEnvelope;
  const headroom = availableForTests - admittedConnections;
  return {
    admittedConnections,
    availableForTests,
    headroom,
    maxConnections,
    nonTestAllowance,
    reservedConnections,
    reservedSlots,
    superuserReservedConnections,
    workers,
  };
}

export function assertPostgresBudget(input) {
  const budget = calculatePostgresBudget(input);
  if (budget.availableForTests <= 0 || budget.headroom < 0) {
    throw new Error(
      `PostgreSQL test budget exceeded: max=${budget.maxConnections}, ` +
        `reserved=${budget.reservedSlots}, nonTest=${budget.nonTestAllowance}, ` +
        `available=${budget.availableForTests}, admitted=${budget.admittedConnections}.`,
    );
  }
  return budget;
}

export function supportedWorkerCount({
  maxConnections,
  nonTestAllowance = DEFAULT_NON_TEST_ALLOWANCE,
  profile: resourceProfile,
  reservedConnections = 0,
  superuserReservedConnections,
}) {
  const available =
    maxConnections -
    reservedConnections -
    superuserReservedConnections -
    nonTestAllowance;
  if (available <= 0) return 0;
  return Math.floor(available / resourceProfile.connectionEnvelope);
}
