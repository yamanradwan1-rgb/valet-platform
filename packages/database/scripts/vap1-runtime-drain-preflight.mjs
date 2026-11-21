// C3 operator preflight. No mutation, credential use, or proof issuance.
// This is a necessary drain condition, NOT evidence of U2 writer closure.
import { vap1ProtectedTables } from "./vap1-security-privileges.mjs";

const safeRole = /^[a-z_][a-z0-9_]{0,62}$/;

function requireSingleRow(result, description) {
  if (result?.rowCount !== 1 || !result.rows?.[0]) {
    throw new Error("VAP1 C3 " + description + " could not be verified.");
  }
  return result.rows[0];
}

export async function assertVap1RuntimeDrainPreflight(client, runtimeRole) {
  if (typeof runtimeRole !== "string" || !safeRole.test(runtimeRole)) {
    throw new Error("VAP1 C3 runtime role identity is not canonical.");
  }
  // FOR SHARE is held until the caller's COMMIT/ROLLBACK. Never use a
  // separate pooled lease: the boundary transition must not race preflight.
  const boundary = requireSingleRow(
    await client.query(
      "SELECT phase FROM auth_proof_private.security_boundary WHERE singleton FOR SHARE",
    ),
    "boundary",
  );
  if (boundary.phase !== "DRAINED" && boundary.phase !== "PROTECTED") {
    throw new Error("VAP1 C3 requires an independently drained boundary.");
  }
  const role = requireSingleRow(
    await client.query(
      "SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb, " +
        "rolcreaterole,rolreplication,rolbypassrls " +
        "FROM pg_catalog.pg_roles WHERE rolname=$1",
      [runtimeRole],
    ),
    "principal",
  );
  if (
    role.rolinherit !== false ||
    role.rolsuper !== false ||
    role.rolcreatedb !== false ||
    role.rolcreaterole !== false ||
    role.rolreplication !== false ||
    role.rolbypassrls !== false
  ) {
    throw new Error("VAP1 C3 runtime principal has unsafe role attributes.");
  }
  const exposure = requireSingleRow(
    await client.query(
      "SELECT " +
        "(SELECT count(*)::integer FROM pg_catalog.pg_auth_members m " +
        "WHERE m.member = r.oid OR m.roleid = r.oid) AS memberships, " +
        "(SELECT count(*)::integer FROM pg_catalog.pg_class c " +
        "JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace " +
        "WHERE n.nspname='public' AND c.relname=ANY($2::text[]) " +
        "AND c.relowner=r.oid) AS owned_protected " +
        "FROM pg_catalog.pg_roles r WHERE r.rolname=$1",
      [runtimeRole, vap1ProtectedTables],
    ),
    "principal membership/ownership exposure",
  );
  if (exposure.memberships !== 0 || exposure.owned_protected !== 0) {
    throw new Error(
      "VAP1 C3 runtime role retains settable memberships or owns protected tables.",
    );
  }
  // The named runtime principal is not the only potential SQL writer.
  // A second ordinary LOGIN with effective limiter writes could discount
  // attempts or forge group binding after the intended ACL retirement.
  const otherWriters = requireSingleRow(
    await client.query(
      "SELECT count(*)::integer AS count FROM pg_catalog.pg_roles r " +
        "WHERE r.rolcanlogin AND NOT r.rolsuper " +
        "AND r.rolname <> $1 AND r.rolname <> current_user " +
        "AND (pg_catalog.has_any_column_privilege(r.rolname, " +
        "'public.anti_abuse_events', 'INSERT') " +
        "OR pg_catalog.has_column_privilege(r.rolname, " +
        "'public.anti_abuse_events', 'state', 'UPDATE') " +
        "OR pg_catalog.has_column_privilege(r.rolname, " +
        "'public.anti_abuse_events', 'group_key_hash', 'UPDATE'))",
      [runtimeRole],
    ),
    "other ordinary anti-abuse SQL writers",
  );
  if (otherWriters.count !== 0) {
    throw new Error(
      "VAP1 C3 found another ordinary login with mutable anti-abuse SQL authority.",
    );
  }
  if (boundary.phase === "PROTECTED") {
    if (role.rolcanlogin !== true) {
      throw new Error("VAP1 C4 protected runtime role is not login-ready.");
    }
    // Caller must separately verify *all* effective protected ACLs before
    // the provisioner can repair anything: silent repair hides drift.
    return { phase: boundary.phase, drain: "NOT_APPLICABLE" };
  }

  // Only the operator changes LOGIN/NOLOGIN in its independently approved
  // drained release sequence. This checker will never change credentials.
  if (role.rolcanlogin !== false) {
    throw new Error(
      "VAP1 C3 runtime role must be NOLOGIN before ACL retirement.",
    );
  }
  const counts = requireSingleRow(
    await client.query(
      "SELECT (SELECT count(*)::integer FROM pg_catalog.pg_stat_activity " +
        "WHERE usename=$1) AS sessions, " +
        "(SELECT count(*)::integer FROM pg_catalog.pg_prepared_xacts " +
        "WHERE owner=$1) AS prepared",
      [runtimeRole],
    ),
    "session/prepared-transaction drain",
  );
  if (
    !Number.isSafeInteger(counts.sessions) ||
    !Number.isSafeInteger(counts.prepared) ||
    counts.sessions !== 0 ||
    counts.prepared !== 0
  ) {
    throw new Error(
      "VAP1 C3 runtime connections or prepared transactions are not drained.",
    );
  }
  // No proof is issued. Separately prove all API/worker ingress is fenced,
  // historical privileged credentials are dead, and N/R are compatible.
  return { phase: boundary.phase, drain: "ZERO_OBSERVED_AT_PREFLIGHT" };
}
