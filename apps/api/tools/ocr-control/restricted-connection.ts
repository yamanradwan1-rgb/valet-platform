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
// Exact SQL identities from W2's ocr-privilege-policy.mjs. Never whitelist
// overloaded names or unrelated PUBLIC SECURITY DEFINER entry points.
const approvedFunctions: Record<OcrToolRole, readonly string[]> = {
  operator: [
    "public.ocr_operator_provision_period(uuid,text,timestamptz,timestamptz,bigint,text,text)",
    "public.ocr_operator_set_org(uuid,uuid,bigint,boolean,integer,text,text)",
    "public.ocr_operator_allocate(uuid,uuid,uuid,bigint,bigint,text,text)",
    "public.ocr_operator_set_platform(uuid,bigint,boolean,text,integer,text,text)",
    "public.ocr_operator_activate_period(uuid,bigint,uuid,text,text)",
    "public.ocr_operator_resolve_attempt(uuid,uuid,uuid,bigint,text,text,text)",
  ],
  maintenance: ["public.ocr_detect_expired(integer)"],
};

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
  readonly rolinherit: boolean;
  readonly rolsuper: boolean;
  readonly rolcreatedb: boolean;
  readonly rolcreaterole: boolean;
  readonly rolreplication: boolean;
  readonly rolbypassrls: boolean;
  readonly can_create_database: boolean;
  readonly can_create_schema: boolean;
  readonly member_role_names: string[];
  readonly has_direct_ocr_table_access: boolean;
  readonly has_unapproved_public_relation_access: boolean;
  readonly has_unapproved_security_definer_access: boolean;
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
              role.rolcanlogin, role.rolinherit, role.rolsuper, role.rolcreatedb,
              role.rolcreaterole, role.rolreplication, role.rolbypassrls,
              ARRAY(
                SELECT granted.rolname::text
                FROM pg_catalog.pg_auth_members AS membership
                JOIN pg_catalog.pg_roles AS granted
                  ON granted.oid=membership.roleid
                WHERE membership.member=role.oid
                ORDER BY granted.rolname
              ) AS member_role_names,
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
                    has_table_privilege(session_user,relation.oid,
                      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
                    has_any_column_privilege(session_user,relation.oid,
                      'SELECT,INSERT,UPDATE,REFERENCES')
                  )
              ) AS has_direct_ocr_table_access,
              EXISTS (
                SELECT 1 FROM pg_catalog.pg_class AS unrelated
                JOIN pg_catalog.pg_namespace AS unrelated_namespace
                  ON unrelated_namespace.oid=unrelated.relnamespace
                WHERE unrelated_namespace.nspname='public'
                  AND unrelated.relkind IN ('r','p','v','m','S')
                  AND unrelated.relname NOT IN (
                    'ocr_platform_control', 'ocr_organization_control',
                    'ocr_budget_periods', 'ocr_organization_allocations',
                    'ocr_attempts', 'ocr_control_history'
                  )
                  AND (
                    unrelated.relowner=role.oid OR
                    has_table_privilege(session_user,unrelated.oid,
                      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
                    has_any_column_privilege(session_user,unrelated.oid,
                      'SELECT,INSERT,UPDATE,REFERENCES')
                  )
              ) AS has_unapproved_public_relation_access,
              EXISTS (
                SELECT 1 FROM pg_catalog.pg_proc AS function
                JOIN pg_catalog.pg_namespace AS function_namespace
                  ON function_namespace.oid=function.pronamespace
                WHERE function_namespace.nspname='public'
                  AND function.prosecdef
                  AND has_function_privilege(session_user,function.oid,'EXECUTE')
                  AND NOT EXISTS (
                    SELECT 1 FROM unnest($1::text[]) AS allowed(signature)
                    WHERE function.oid=to_regprocedure(allowed.signature)::oid
                  )
              ) AS has_unapproved_security_definer_access
       FROM pg_catalog.pg_roles AS role
       WHERE role.rolname=session_user`,
      [approvedFunctions[role]],
    );
    const principal = safety.rows[0];
    const expectedMemberships =
      role === "operator" ? ["vaylet_ocr_operator"] : [];
    if (
      safety.rowCount !== 1 ||
      !principal?.unchanged_role ||
      principal.rolcanlogin !== true ||
      principal.rolinherit !== false ||
      !Array.isArray(principal.member_role_names) ||
      principal.member_role_names.length !== expectedMemberships.length ||
      !principal.member_role_names.every(
        (value, index) => value === expectedMemberships[index],
      ) ||
      principal.rolsuper !== false ||
      principal.rolcreatedb !== false ||
      principal.rolcreaterole !== false ||
      principal.rolreplication !== false ||
      principal.rolbypassrls !== false ||
      principal.can_create_database !== false ||
      principal.can_create_schema !== false ||
      principal.has_direct_ocr_table_access !== false ||
      principal.has_unapproved_public_relation_access !== false ||
      principal.has_unapproved_security_definer_access !== false ||
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
