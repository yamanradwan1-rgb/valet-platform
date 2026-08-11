import type { ClientConfig } from "pg";

export const acceptedRoles = [
  "ORG_ADMIN",
  "LOCATION_MANAGER",
  "VALET_SUPERVISOR",
  "VALET_EMPLOYEE",
] as const;

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

export interface DatabaseClient {
  connect(): Promise<unknown>;
  end(): Promise<void>;
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rowCount: number | null; readonly rows: Row[] }>;
}

export interface ExecutionDependencies {
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

export function fail(message: string): never {
  throw new StaffProvisioningError(message);
}
