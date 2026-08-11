import type { Client, ClientConfig } from "pg";

export interface ParsedDatabaseConfiguration {
  readonly parsed: URL;
  readonly value: string;
}

export function parseMigrationDatabaseUrl(
  value: string | undefined,
  nodeEnv?: string,
): ParsedDatabaseConfiguration;
export function parseRuntimeDatabaseUrlForProvisioning(
  value: string | undefined,
): ParsedDatabaseConfiguration;
export function migrationClientConfig(
  migration: ParsedDatabaseConfiguration,
  nodeEnv?: string,
): ClientConfig;
export function verifyMigrationConnectionTls(
  client: Client,
  nodeEnv?: string,
): Promise<void>;
export function decodedDatabaseIdentity(
  configuration: ParsedDatabaseConfiguration,
): {
  readonly database: string;
  readonly host: string;
  readonly password: string;
  readonly port: string;
  readonly role: string;
};
export function assertDatabaseCredentialSeparation(
  migration: ParsedDatabaseConfiguration,
  runtime: ParsedDatabaseConfiguration,
  nodeEnv?: string,
): void;
