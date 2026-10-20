import type { PostgresTransaction } from "../../../common/database/postgres";

export interface U05V2LedgerProof {
  readonly migrationLedgerSha256: string;
  readonly ledgerHelperFunctionSha256: string;
}

const helper = "public.issue300_r2_v2_migration_ledger_sha256()";
const runtime = "issue300_r2_w7_runtime_v2";
const owner = "issue300_r2_w7_owner_v2";
const digestPattern = /^[a-f0-9]{64}$/;

/** Separate catalog-only statement: do not combine with an invocation using
 * SQL AND, CASE or CTE, because PostgreSQL can reorder expressions. */
export const v2LedgerCatalogSql = `SELECT (
     current_database() = 'issue300_r2_w7_acceptance_v2'
     AND current_user = '${runtime}'
     AND session_user = '${runtime}'
     AND current_setting('server_version_num')::int = 170010
     AND NOT pg_catalog.has_table_privilege(current_user,
       'public._prisma_migrations','SELECT')
     AND pg_catalog.has_function_privilege(current_user,
       '${helper}','EXECUTE')
     AND owner.rolname = '${owner}'
     AND lang.lanname = 'sql'
     AND p.prosecdef = true
     AND p.provolatile = 's'
     AND p.pronargs = 0
     AND p.prorettype = 'pg_catalog.text'::regtype
     AND p.proconfig = ARRAY['search_path=pg_catalog, pg_temp']::text[]
     AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
         p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
       WHERE acl.privilege_type = 'EXECUTE'
         AND (acl.grantee = 0 OR acl.grantee NOT IN
           (p.proowner,'${runtime}'::regrole::oid))
     )
     AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
       pg_catalog.pg_get_functiondef(p.oid),'UTF8')),'hex') = $1::text
   ) AS valid
   FROM pg_catalog.pg_proc p
   JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner
   JOIN pg_catalog.pg_language lang ON lang.oid=p.prolang
   WHERE p.oid=pg_catalog.to_regprocedure('${helper}')`;

export const v2LedgerReadSql = `SELECT ${helper} AS digest`;

/** Same existing request/transaction, no DB connection owned here. Fresh
 * per-request check. SQL errors, missing function, NULL or stale certificate
 * return false; the caller keeps its existing U05 503 fail-closed exception. */
export async function verifyU05V2LedgerRuntime(
  tx: PostgresTransaction,
  proof: U05V2LedgerProof,
): Promise<boolean> {
  if (!digestPattern.test(proof.migrationLedgerSha256 ?? "") ||
      !digestPattern.test(proof.ledgerHelperFunctionSha256 ?? "")) return false;
  try {
    const safe = await tx.query<{ readonly valid: boolean }>(
      v2LedgerCatalogSql, [proof.ledgerHelperFunctionSha256],
    );
    if (safe.rowCount !== 1 || safe.rows[0]?.valid !== true) return false;
    // The preceding statement MUST finish and be validated before this
    // SECURITY DEFINER helper is referenced by any SQL at all.
    const ledger = await tx.query<{ readonly digest: string | null }>(
      v2LedgerReadSql,
    );
    return ledger.rowCount === 1 &&
      ledger.rows[0]?.digest === proof.migrationLedgerSha256;
  } catch {
    return false;
  }
}
