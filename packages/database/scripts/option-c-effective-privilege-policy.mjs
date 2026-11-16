import { inspectOptionCPrivilegeRows } from "./option-c-effective-privilege-row-fences.mjs";
import { optionCFunctionContract } from "./option-c-protected-cutover-acl.mjs";
import { staffSessionLockOwnerColumns } from "./option-c-staff-session-lock-contract.mjs";

export const protectedTables = new Set([
  "staff_auth_sessions",
  "staff_refresh_credentials",
  "users",
  "user_mfa_totp_factors",
  "mfa_recovery_codes",
  "anti_abuse_events",
  "organization_memberships",
  "locations",
  "staff_onboarding_invitations",
  "audit_events",
  "membership_location_access",
]);

const writers = ["staffAuthWriter", "mfaWriter", "managementWriter"];
const sensitiveUpdates = {
  staff_auth_sessions: [
    "current_access_token_hash",
    "access_expires_at",
    "last_rotated_at",
    "mfa_authenticated_at",
    "mfa_factor_id",
    "last_admin_activity_at",
    "runtime_lock_version",
  ],
  staff_refresh_credentials: [
    "token_hash",
    "consumed_at",
    "replaced_by_credential_id",
  ],
  users: ["password_hash", "last_login_at", "status"],
  user_mfa_totp_factors: ["secret_ciphertext", "verified_at", "disabled_at"],
  mfa_recovery_codes: ["code_hash", "consumed_at"],
  organization_memberships: ["role", "status"],
  locations: ["organization_id"],
};
const elevated = [
  "superuser",
  "create_database",
  "create_role",
  "replication",
  "bypass_rls",
];
const protectedFunctions = new Map([
  ...optionCFunctionContract.staffAuth.map((name, index) => [
    name,
    {
      role: "staffAuthWriter",
      path: index === 0 ? "pg_catalog, public" : "pg_catalog",
    },
  ]),
  ...optionCFunctionContract.mfa.map((name) => [
    name,
    { role: "mfaWriter", path: "pg_catalog" },
  ]),
  ...optionCFunctionContract.management.map((name) => [
    name,
    {
      role: "managementWriter",
      path: "pg_catalog, public",
    },
  ]),
  [
    optionCFunctionContract.mfaActivity,
    {
      role: "runtime",
      path: "pg_catalog",
    },
  ],
  [
    optionCFunctionContract.runtimeSessionLock,
    {
      role: "runtime",
      path: "pg_catalog",
      owner: "sessionLockOwner",
    },
  ],
]);
const rowKey = (kind, role, object, privilege, column) =>
  `${kind}|${role}|${object}|${privilege}|${column || ""}`;

export function checkOptionCPrivilegeMatrix(matrix, roles) {
  const failures = [];
  const byKey = new Map(
    matrix.map((row) => [
      rowKey(row.kind, row.role, row.object, row.privilege, row.column),
      row,
    ]),
  );
  const requireDenied = (kind, role, object, privilege, column) => {
    const row = byKey.get(rowKey(kind, role, object, privilege, column));
    if (!row || row.effective !== false) {
      failures.push(
        `${role}: ${kind} ${object}${column ? "." + column : ""} ${privilege} must be denied`,
      );
    }
  };
  const requireAllowed = (kind, role, object, privilege, column) => {
    const row = byKey.get(rowKey(kind, role, object, privilege, column));
    if (!row || row.effective !== true) {
      failures.push(
        `${role}: ${kind} ${object}${column ? "." + column : ""} ${privilege} must be allowed`,
      );
    }
  };
  const forbidRole = (source, target) => {
    const row = matrix.find(
      (r) =>
        r.kind === "membership" && r.role === source && r.object === target,
    );
    if (
      row?.member ||
      row?.effective_set ||
      row?.effective_inherit ||
      row?.direct_admin
    ) {
      failures.push(`${source}: membership/SET/INHERIT/ADMIN in ${target}`);
    }
  };
  for (const key of ["runtime", ...writers, "sessionLockOwner"]) {
    const role = roles[key];
    const attributes = matrix.find((r) => r.kind === "role" && r.role === role);
    if (!attributes) {
      failures.push(`Missing role ${role}`);
      continue;
    }
    if (elevated.some((attr) => attributes[attr]))
      failures.push(`${role}: elevated role attributes`);
    for (const other of [...writers, "sessionLockOwner"]) {
      if (other !== key) forbidRole(role, roles[other]);
    }
  }
  const lock = matrix.find(
    (r) => r.kind === "role" && r.role === roles.sessionLockOwner,
  );
  if (lock?.login !== false)
    failures.push("Session lock owner must be NOLOGIN");
  for (const table of protectedTables) {
    for (const key of ["runtime", ...writers, "sessionLockOwner"]) {
      if (!byKey.has(rowKey("table", roles[key], table, "SELECT"))) {
        failures.push(`Missing protected table ${table} for ${roles[key]}`);
      }
    }
  }
  const databaseOwner = matrix.find(
    (r) => r.kind === "role" && r.role === roles.migrationRole,
  )?.database_owner;
  if (!databaseOwner) failures.push("Database owner identity is missing");
  for (const membership of matrix.filter(
    (r) =>
      r.kind === "membership" &&
      r.object === roles.sessionLockOwner &&
      r.member,
  )) {
    const migrator =
      membership.role === roles.migrationRole &&
      membership.effective_set === true &&
      membership.effective_inherit === false &&
      membership.direct_set === true &&
      membership.direct_inherit === false &&
      membership.direct_admin === false &&
      [roles.migrationRole, databaseOwner].includes(membership.grantor);
    const ownerAdmin =
      membership.role === databaseOwner &&
      membership.direct_admin === true &&
      membership.direct_set === false &&
      membership.direct_inherit === false &&
      membership.effective_inherit === false &&
      membership.grantor === databaseOwner;
    if (!migrator && !ownerAdmin)
      failures.push("Session lock owner has an unexpected membership route");
  }
  // Also reject memberships held by the NOLOGIN lock role itself.
  if (
    matrix.some(
      (r) =>
        r.kind === "membership" &&
        r.role === roles.sessionLockOwner &&
        r.member,
    )
  ) {
    failures.push("Session lock owner belongs to another role");
  }

  const session = "staff_auth_sessions";
  requireDenied(
    "column",
    roles.runtime,
    session,
    "SELECT",
    "current_access_token_hash",
  );
  requireDenied(
    "column",
    roles.managementWriter,
    session,
    "SELECT",
    "current_access_token_hash",
  );
  requireDenied(
    "column",
    roles.managementWriter,
    session,
    "UPDATE",
    "last_admin_activity_at",
  );
  requireDenied("column", roles.mfaWriter, "users", "SELECT", "password_hash");
  requireDenied("table", roles.mfaWriter, "users", "SELECT");
  for (const [table, columns] of Object.entries(sensitiveUpdates)) {
    for (const column of columns) {
      if (byKey.has(rowKey("column", roles.runtime, table, "UPDATE", column))) {
        requireDenied("column", roles.runtime, table, "UPDATE", column);
      }
    }
  }
  for (const table of ["users", "organization_memberships", "locations"]) {
    for (const privilege of ["UPDATE", "INSERT", "DELETE", "TRUNCATE"]) {
      requireDenied("table", roles.managementWriter, table, privilege);
    }
    for (const row of matrix.filter(
      (r) =>
        r.kind === "column" &&
        r.role === roles.managementWriter &&
        r.object === table &&
        ["UPDATE", "INSERT"].includes(r.privilege) &&
        r.effective,
    )) {
      failures.push(
        `Management Writer ${table}.${row.column} ${row.privilege} is unsafe`,
      );
    }
  }
  failures.push(
    ...inspectOptionCPrivilegeRows(matrix, roles, {
      staffSessionLockOwnerColumns,
      protectedTables,
      protectedFunctions,
      writers,
    }),
  );
  for (const [table, privileges] of Object.entries(
    staffSessionLockOwnerColumns,
  )) {
    for (const [privilege, columns] of Object.entries(privileges)) {
      for (const column of columns)
        requireAllowed(
          "column",
          roles.sessionLockOwner,
          table,
          privilege,
          column,
        );
    }
  }
  return [...new Set(failures)].sort();
}
