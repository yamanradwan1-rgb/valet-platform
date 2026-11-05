import { Client, type ClientConfig } from "pg";
import {
  migrationClientConfig,
  parseMigrationDatabaseUrl,
  verifyMigrationConnectionTls,
} from "../../../../packages/database/scripts/database-connection-policy.mjs";
import {
  assertNonProductionLoopback,
  requireNodeEnvironment,
} from "../staff-provisioning/provisioning-input";

export type OcrToolRole = "operator" | "maintenance";

export interface OcrToolClient {
  connect(): Promise<unknown>;
  end(): Promise<void>;
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rowCount: number | null; readonly rows: Row[] }>;
}

export interface OcrToolConnectionDependencies {
  readonly createClient: (config: ClientConfig) => OcrToolClient;
  readonly verifyTls: (
    client: OcrToolClient,
    environment: string,
  ) => Promise<void>;
}

const defaults: OcrToolConnectionDependencies = {
  createClient: (config) => new Client(config) as unknown as OcrToolClient,
  verifyTls: (client, environment) =>
    verifyMigrationConnectionTls(client as unknown as Client, environment),
};
const ocrLoginPattern = /^[a-z_][a-z0-9_]{0,62}$/;

export class OcrToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrToolError";
  }
}

function databaseRole(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(new URL(value).username);
  } catch {
    return undefined;
  }
}

interface RoleSafety extends Record<string, unknown> {
  readonly session_role: string;
  readonly unchanged_role: boolean;
  readonly rolcanlogin: boolean;
  readonly rolsuper: boolean;
  readonly rolcreatedb: boolean;
  readonly rolcreaterole: boolean;
  readonly rolreplication: boolean;
  readonly rolbypassrls: boolean;
  readonly can_create_database: boolean;
  readonly can_create_schema: boolean;
  readonly has_direct_ocr_table_access: boolean;
}

/** The DB session identity, not a caller string, authenticates every tool call. */
export async function withRestrictedOcrClient<T>(
  role: OcrToolRole,
  environment: NodeJS.ProcessEnv,
  operation: (client: OcrToolClient) => Promise<T>,
  dependencies: OcrToolConnectionDependencies = defaults,
): Promise<T> {
  const variable =
    role === "operator"
      ? "OCR_OPERATOR_DATABASE_URL"
      : "OCR_MAINTENANCE_DATABASE_URL";
  const supplied = environment[variable];
  if (!supplied)
    throw new OcrToolError("Restricted OCR credentials are required.");

  let configuration: ClientConfig;
  try {
    const nodeEnvironment = requireNodeEnvironment(environment.NODE_ENV);
    const parsed = parseMigrationDatabaseUrl(supplied, nodeEnvironment);
    assertNonProductionLoopback(nodeEnvironment, parsed.parsed.hostname);
    const currentRole = databaseRole(supplied);
    if (
      !currentRole ||
      !ocrLoginPattern.test(currentRole) ||
      [
        databaseRole(environment.DATABASE_URL),
        databaseRole(environment.MIGRATION_DATABASE_URL),
        databaseRole(
          environment[
            role === "operator"
              ? "OCR_MAINTENANCE_DATABASE_URL"
              : "OCR_OPERATOR_DATABASE_URL"
          ],
        ),
      ].includes(currentRole)
    ) {
      throw new OcrToolError("A distinct restricted OCR role is required.");
    }
    configuration = migrationClientConfig(parsed, nodeEnvironment);
    configuration.connectionTimeoutMillis = 1000;
    configuration.query_timeout = role === "maintenance" ? 100 : 1000;
    configuration.statement_timeout = role === "maintenance" ? 50 : 500;
  } catch {
    throw new OcrToolError(
      "Restricted OCR connection configuration is invalid.",
    );
  }

  const client = dependencies.createClient(configuration);
  try {
    await client.connect();
    await dependencies.verifyTls(client, environment.NODE_ENV!);
    const safety = await client.query<RoleSafety>(
      `SELECT session_user::text AS session_role,
              (session_user = current_user) AS unchanged_role,
              role.rolcanlogin, role.rolsuper, role.rolcreatedb,
              role.rolcreaterole, role.rolreplication, role.rolbypassrls,
              has_database_privilege(session_user,current_database(),'CREATE')
                AS can_create_database,
              has_schema_privilege(session_user,'public','CREATE')
                AS can_create_schema,
              EXISTS (
                SELECT 1 FROM pg_catalog.pg_class AS relation
                JOIN pg_catalog.pg_namespace AS namespace
                  ON namespace.oid=relation.relnamespace
                WHERE namespace.nspname='public'
                  AND relation.relname IN (
                    'ocr_platform_control', 'ocr_organization_control',
                    'ocr_budget_periods', 'ocr_organization_allocations',
                    'ocr_attempts', 'ocr_control_history'
                  )
                  AND relation.relkind IN ('r','p')
                  AND (
                    relation.relowner=role.oid OR
                    has_table_privilege(session_user,relation.oid,'SELECT') OR
                    has_table_privilege(session_user,relation.oid,'INSERT') OR
                    has_table_privilege(session_user,relation.oid,'UPDATE') OR
                    has_table_privilege(session_user,relation.oid,'DELETE') OR
                    has_table_privilege(session_user,relation.oid,'TRUNCATE')
                  )
              ) AS has_direct_ocr_table_access
       FROM pg_catalog.pg_roles AS role
       WHERE role.rolname=session_user`,
    );
    const principal = safety.rows[0];
    if (
      safety.rowCount !== 1 ||
      !principal?.unchanged_role ||
      principal.rolcanlogin !== true ||
      principal.rolsuper !== false ||
      principal.rolcreatedb !== false ||
      principal.rolcreaterole !== false ||
      principal.rolreplication !== false ||
      principal.rolbypassrls !== false ||
      principal.can_create_database !== false ||
      principal.can_create_schema !== false ||
      principal.has_direct_ocr_table_access !== false ||
      principal.session_role !== databaseRole(environment[variable])
    ) {
      throw new OcrToolError("Restricted OCR database principal is unsafe.");
    }
    return await operation(client);
  } catch (error) {
    if (error instanceof OcrToolError) throw error;
    throw new OcrToolError("Restricted OCR operation failed.");
  } finally {
    await client.end().catch(() => undefined);
  }
}
