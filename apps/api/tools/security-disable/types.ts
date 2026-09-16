import type { ClientConfig } from "pg";

export interface SecurityDisableArguments {
  readonly operation: "disable-user";
  readonly operationId: string;
  readonly operatorRef: string;
  readonly userId: string;
}

export interface SecurityDisableResult {
  readonly operationId: string;
  readonly userId: string;
}

export interface SecurityDisableDatabaseClient {
  connect(): Promise<unknown>;
  end(): Promise<void>;
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rowCount: number | null; readonly rows: Row[] }>;
}

export interface SecurityDisableExecutionDependencies {
  readonly createClient: (configuration: ClientConfig) => SecurityDisableDatabaseClient;
  readonly verifyTls: (
    client: SecurityDisableDatabaseClient,
    nodeEnvironment: string,
  ) => Promise<void>;
}

export class ControlledSecurityDisableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControlledSecurityDisableError";
  }
}

export function failSecurityDisable(message: string): never {
  throw new ControlledSecurityDisableError(message);
}
