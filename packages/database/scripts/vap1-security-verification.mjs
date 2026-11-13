// Admin-only effective-ACL negative verifier. No SQL privilege is granted.
import {
  vap1LegacyFunctionSignatures,
  vap1ProtectedTables,
} from "./vap1-security-privileges.mjs";

async function count(client, sql, params) {
  const result = await client.query(sql, params);
  return Number(result.rows[0]?.count ?? -1);
}

export async function verifyVap1PrivateIsolation(client, runtimeRole) {
  const role = await client.query(
    `SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,
            rolreplication,rolbypassrls
       FROM pg_catalog.pg_roles WHERE rolname=$1`,
    [runtimeRole],
  );
  const flags = role.rows[0];
  if (
    !flags?.rolcanlogin ||
    flags.rolinherit ||
    flags.rolsuper ||
    flags.rolcreatedb ||
    flags.rolcreaterole ||
    flags.rolreplication ||
    flags.rolbypassrls
  ) throw new Error("VAP1 unsafe runtime principal.");

  const owner = await client.query(
    `SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb,
            rolcreaterole,rolreplication,rolbypassrls
       FROM pg_catalog.pg_roles WHERE rolname='vap1_proof_owner'`,
  );
  if (
    owner.rowCount !== 1 ||
    Object.values(owner.rows[0]).some(Boolean)
  ) throw new Error("VAP1 proof owner is not a restricted NOLOGIN role.");

  const boundary = await client.query(
    `SELECT phase FROM auth_proof_private.security_boundary WHERE singleton`,
  );
  if (boundary.rowCount !== 1) {
    throw new Error("VAP1 boundary is absent or duplicated.");
  }
  const currentPhase = boundary.rows[0].phase;

  const roleGrant = await count(
    client,
    `SELECT count(*)::integer AS count FROM pg_catalog.pg_auth_members m
       JOIN pg_catalog.pg_roles member ON member.oid=m.member
       JOIN pg_catalog.pg_roles role ON role.oid=m.roleid
       WHERE member.rolname=$1`,
    [runtimeRole],
  );
  if (roleGrant !== 0) throw new Error("VAP1 runtime role has inherited/settable roles.");

  const privateAccess = await client.query(
    `SELECT
       pg_catalog.has_schema_privilege($1,'auth_proof_private','USAGE') AS usage,
       pg_catalog.has_schema_privilege($1,'auth_proof_private','CREATE') AS create,
       pg_catalog.has_table_privilege(
         $1,'auth_proof_private.proof_keys','SELECT') AS key_read,
       pg_catalog.has_table_privilege(
         $1,'auth_proof_private.proof_challenges','INSERT') AS challenge_write,
       pg_catalog.has_table_privilege(
         $1,'auth_proof_private.operation_receipts','SELECT') AS receipt_read,
       pg_catalog.has_table_privilege(
         $1,'auth_proof_private.authority_admissions','UPDATE') AS admission_write`,
    [runtimeRole],
  );
  if (Object.values(privateAccess.rows[0] ?? {}).some(Boolean)) {
    throw new Error("VAP1 private authority is reachable by ordinary runtime.");
  }

  const ownerMismatch = await count(
    client,
    `SELECT count(*)::integer AS count
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
       JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
       WHERE n.nspname='auth_proof_private' AND r.rolname <> 'vap1_proof_owner'`,
  );
  if (ownerMismatch !== 0) throw new Error("VAP1 private function owner mismatch.");
  const publicFunctionExecute = await count(
    client,
    `SELECT count(*)::integer AS count FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))
       ) a
       WHERE n.nspname='auth_proof_private'
         AND a.grantee=0 AND a.privilege_type='EXECUTE'`,
  );
  if (publicFunctionExecute !== 0) {
    throw new Error("VAP1 private SQL function is PUBLIC executable.");
  }

  if (currentPhase === "PROTECTED" || currentPhase === "DRAINED") {
    for (const table of vap1ProtectedTables) {
      const right = await client.query(
        `SELECT pg_catalog.has_table_privilege($1,$2,'INSERT') AS ins,
                pg_catalog.has_table_privilege($1,$2,'UPDATE') AS upd,
                pg_catalog.has_table_privilege($1,$2,'DELETE') AS del,
                pg_catalog.has_any_column_privilege($1,$2,'INSERT') AS any_ins,
                pg_catalog.has_any_column_privilege($1,$2,'UPDATE') AS any_upd`,
        [runtimeRole, `public.${table}`],
      );
      if (Object.values(right.rows[0] ?? {}).some(Boolean)) {
        throw new Error(`VAP1 protected table writes remain: ${table}`);
      }
    }
    for (const signature of vap1LegacyFunctionSignatures) {
      const can = await client.query(
        "SELECT pg_catalog.has_function_privilege($1,$2,'EXECUTE') AS can",
        [runtimeRole, signature],
      );
      if (can.rows[0]?.can) {
        throw new Error(`VAP1 legacy definer remains executable: ${signature}`);
      }
    }
  }
  return { phase: currentPhase, checkedLegacyFunctions: vap1LegacyFunctionSignatures.length };
}
