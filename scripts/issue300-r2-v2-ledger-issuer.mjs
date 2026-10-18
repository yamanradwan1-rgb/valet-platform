import assert from "node:assert/strict";
import { buildV2HelperSql, expectedLedgerFromSource } from "./issue300-r2-v2-ledger-helper.mjs";

const helperName = "public.issue300_r2_v2_migration_ledger_sha256()";
const ownerRole = "issue300_r2_w7_owner_v2";
const runtimeRole = "issue300_r2_w7_runtime_v2";
const sha = /^[a-f0-9]{64}$/;

/** Read-only issuer preflight, after isolated DB/role/96-ledger checks and
 * before owner Ed25519 signing. This cannot install or modify any function. */
export async function attestV2LedgerHelper(admin, runtime, signedLedgerSha256) {
  assert.match(signedLedgerSha256 ?? "", sha);
  const plan = buildV2HelperSql(expectedLedgerFromSource());
  assert.equal(plan.expectedDigest, signedLedgerSha256, "V2_LEDGER_SOURCE_MISMATCH");
  const approvedBody = plan.ddl.split("$issue300_r2_v2_ledger$")[1];
  assert(approvedBody?.length > 100, "V2_HELPER_SOURCE_MISSING");
  const result = await admin.query(
    `SELECT p.prosrc AS body,
            pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
              pg_catalog.pg_get_functiondef(p.oid), 'UTF8')), 'hex') AS fingerprint,
            owner.rolname AS owner,
            lang.lanname AS language,
            p.prosecdef AS security_definer,
            p.provolatile AS volatility,
            p.proconfig AS configuration,
            p.pronargs AS argument_count,
            p.prorettype = 'pg_catalog.text'::regtype AS text_result,
            pg_catalog.has_function_privilege($1::text,p.oid,'EXECUTE') AS runtime_execute,
            NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
              p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
              WHERE acl.privilege_type='EXECUTE' AND
                (acl.grantee=0 OR acl.grantee NOT IN
                  (p.proowner,($1::text)::regrole::oid))) AS exclusive_execute,
            NOT pg_catalog.has_table_privilege($1::text,
              'public._prisma_migrations','SELECT') AS no_ledger_select
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner
       JOIN pg_catalog.pg_language lang ON lang.oid=p.prolang
      WHERE p.oid=pg_catalog.to_regprocedure($2::text)`,
    [runtimeRole, helperName],
  );
  assert.equal(result.rowCount, 1, "V2_HELPER_MISSING");
  const row = result.rows[0];
  assert(row?.body === approvedBody &&
    row?.owner === ownerRole && row?.language === "sql" &&
    row?.security_definer === true && row?.volatility === "s" &&
    row?.argument_count === 0 && row?.text_result === true &&
    Array.isArray(row?.configuration) && row.configuration.length === 1 &&
    row.configuration[0] === "search_path=pg_catalog, pg_temp" &&
    row?.exclusive_execute === true && row?.runtime_execute === true &&
    row?.no_ledger_select === true,
  "V2_LEDGER_HELPER_CATALOG_UNTRUSTED");
  assert.match(row.fingerprint ?? "", sha);
  // A separate runtime EXECUTE-only read also confirms that this exact
  // restricted role can obtain the checksum without table SELECT rights.
  const role = await runtime.query(
    `SELECT current_database()=$1::text AND current_user=$2::text
            AND session_user=$2::text
            AND NOT pg_catalog.has_table_privilege(current_user,
              'public._prisma_migrations','SELECT') AS valid`,
    ["issue300_r2_w7_acceptance_v2", runtimeRole],
  );
  assert(role.rowCount === 1 && role.rows[0]?.valid === true,
    "V2_RUNTIME_IDENTITY_DENIED");
  const ledger = await runtime.query(`SELECT ${helperName} AS digest`);
  assert(ledger.rowCount === 1 && ledger.rows[0]?.digest === signedLedgerSha256,
    "V2_LEDGER_LIVE_MISMATCH");
  return row.fingerprint;
}
