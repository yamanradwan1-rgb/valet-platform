import { catalogQueries } from "./option-c-effective-privilege-catalog.mjs";
import { checkOptionCPrivilegeMatrix } from "./option-c-effective-privilege-policy.mjs";

const roleKeys = [
  "runtime",
  "staffAuthWriter",
  "mfaWriter",
  "managementWriter",
  "sessionLockOwner",
  "migrationRole",
];
const compare = (a, b) =>
  JSON.stringify(a).localeCompare(JSON.stringify(b), "en");
const clean = (value) => {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, clean(value[key])]),
    );
  }
  return value;
};

export function normalizeOptionCRoles(roles) {
  const resolved = {
    ...roles,
    sessionLockOwner:
      roles?.sessionLockOwner || "vaylet_staff_session_lock_owner",
  };
  if (
    roleKeys.some((key) => !/^[a-z_][a-z0-9_]{0,62}$/.test(resolved[key] || ""))
  ) {
    throw new Error(
      `Option C audit requires valid roles: ${roleKeys.join(", ")}`,
    );
  }
  if (new Set(roleKeys.map((key) => resolved[key])).size !== roleKeys.length) {
    throw new Error("Option C audit roles must be distinct");
  }
  return Object.fromEntries(roleKeys.map((key) => [key, resolved[key]]));
}

export function serializeOptionCPrivilegeSnapshot(snapshot) {
  return JSON.stringify(clean(snapshot), null, 2) + "\n";
}

export function compareOptionCPrivilegeSnapshots(before, after) {
  const rows = (snapshot) =>
    new Map(
      snapshot.matrix.map((row) => [
        JSON.stringify([
          row.kind,
          row.role,
          row.object,
          row.column || "",
          row.privilege || "",
          row.grantee || "",
        ]),
        serializeOptionCPrivilegeSnapshot(row),
      ]),
    );
  const left = rows(before);
  const right = rows(after);
  const changes = [...new Set([...left.keys(), ...right.keys()])]
    .sort()
    .filter((key) => left.get(key) !== right.get(key))
    .map((key) => ({
      identity: JSON.parse(key),
      before: left.has(key) ? JSON.parse(left.get(key)) : null,
      after: right.has(key) ? JSON.parse(right.get(key)) : null,
    }));
  return { changed: changes.length > 0, changes };
}

export async function auditOptionCEffectivePrivileges(client, roles) {
  const configured = normalizeOptionCRoles(roles);
  const names = roleKeys.map((key) => configured[key]);
  const matrix = [];
  // A single transaction/snapshot is the caller's responsibility when auditing
  // concurrent provisioning. No session-setting SQL is issued by this module.
  for (const [kind, sql] of Object.entries(catalogQueries)) {
    const params =
      kind === "memberships"
        ? [names, configured.sessionLockOwner]
        : kind === "defaults"
          ? []
          : [names];
    const result = await client.query(sql, params);
    if (!Array.isArray(result?.rows))
      throw new Error(`Missing ${kind} catalog evidence`);
    for (const original of result.rows) {
      const row = clean({
        kind:
          kind === "roles"
            ? "role"
            : kind === "memberships"
              ? "membership"
              : kind === "schemas"
                ? "schema"
                : kind === "tables"
                  ? "table"
                  : kind === "columns"
                    ? "column"
                    : kind === "sequences"
                      ? "sequence"
                      : kind === "functions"
                        ? "function"
                        : "default",
        ...original,
      });
      if (Array.isArray(row.grants)) row.grants.sort(compare);
      matrix.push(row);
    }
  }
  matrix.sort((a, b) => compare(a, b));
  return { roles: configured, matrix };
}

export async function verifyOptionCEffectivePrivileges(client, roles) {
  const snapshot = await auditOptionCEffectivePrivileges(client, roles);
  const failures = checkOptionCPrivilegeMatrix(snapshot.matrix, snapshot.roles);
  if (failures.length) {
    const error = new Error(
      `Option C effective privilege audit failed:\n${failures.join("\n")}`,
    );
    error.failures = failures;
    error.snapshot = snapshot;
    throw error;
  }
  return snapshot;
}
