export const EMPLOYEE_E2E = {
  email: process.env.E2E_STAFF_EMAIL ?? "e2e-driver@valet.test",
  keySlots: ["E2E-KEY-L", "E2E-KEY-I", "E2E-KEY-R"],
  locationCode: "E2E",
  locationId: "e2e00000-0000-4000-8000-000000000001",
  membershipId: "e2e00000-0000-4000-8000-000000000003",
  organizationId: "e2e00000-0000-4000-8000-000000000000",
  parkingSpots: ["E2E-SPOT-L", "E2E-SPOT-I", "E2E-SPOT-R"],
  parkingZoneCode: "E2E-ZONE",
  parkingZoneId: "e2e00000-0000-4000-8000-000000000005",
  shiftId: "e2e00000-0000-4000-8000-000000000004",
  userId: "e2e00000-0000-4000-8000-000000000002",
} as const;

export function assertEmployeeE2eTarget(databaseUrl: string): URL {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Employee E2E provisioning requires NODE_ENV=test.");
  }
  if (process.env.E2E_FIXTURE_CONFIRM !== "employee-e2e") {
    throw new Error("Employee E2E provisioning confirmation is missing.");
  }

  const url = new URL(databaseUrl);
  const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);
  if (!loopbackHosts.has(url.hostname)) {
    throw new Error("Employee E2E provisioning refuses a remote database.");
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const approvedName = process.env.E2E_APPROVED_DATABASE;
  if (!approvedName || databaseName !== approvedName) {
    throw new Error("Database name is not explicitly approved for E2E.");
  }
  if (/prod(uction)?/i.test(databaseName)) {
    throw new Error("Employee E2E provisioning refuses production.");
  }
  return url;
}
