import type { ClientConfig } from "pg";

export interface MfaRecoveryArguments {
  readonly operation: "recover-totp";
  readonly operationId: string;
  readonly operatorRef: string;
  readonly userId: string;
}

export interface MfaRecoveryResult {
  readonly operationId: string;
  readonly userId: string;
}

export interface RecoveryDatabaseClient {
  connect(): Promise<unknown>;
  end(): Promise<void>;
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rowCount: number | null; readonly rows: Row[] }>;
}

export interface MfaRecoveryExecutionDependencies {
  readonly createClient: (configuration: ClientConfig) => RecoveryDatabaseClient;
  readonly verifyTls: (
    client: RecoveryDatabaseClient,
    nodeEnvironment: string,
  ) => Promise<void>;
}

export class ControlledMfaRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControlledMfaRecoveryError";
  }
}

export function failMfaRecovery(message: string): never {
  throw new ControlledMfaRecoveryError(message);
}
