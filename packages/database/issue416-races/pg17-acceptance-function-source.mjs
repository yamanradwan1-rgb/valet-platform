import { createHash } from "node:crypto";

// Pinned to 61 actual pg_get_functiondef outputs after official 140/140
// Prisma migrations in independently attested disposable W30 PG17.11.
// Source-body replacement with unchanged signature/owner must fail closed.
export const FUNCTION_BODY_PIN = Object.freeze({
  count: 61,
  sha256: "43a476ce06379057cd44a0334b5e702336d94e081a4324337f991b4da6da9672",
});

export const FUNCTION_BODY_SQL = `
SELECT p.oid::regprocedure::text AS signature,
 p.prokind AS function_kind, pg_get_userbyid(p.proowner) AS function_owner,
 pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='auth_proof_private'`;

export function functionBodiesDigest(rows) {
  if (
    !Array.isArray(rows) ||
    rows.some(
      (row) =>
        !row ||
        typeof row.signature !== "string" ||
        typeof row.function_kind !== "string" ||
        typeof row.function_owner !== "string" ||
        typeof row.function_definition !== "string",
    )
  ) {
    throw new Error("W30_PG17_FUNCTION_BODY_INCOMPLETE");
  }
  const tuples = rows.map((row) => [
    row.signature,
    row.function_kind,
    row.function_owner,
    row.function_definition,
  ]);
  tuples.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return createHash("sha256")
    .update(JSON.stringify(tuples), "utf8")
    .digest("hex");
}

export function assertPinnedFunctionBodies(rows) {
  if (
    !Array.isArray(rows) ||
    rows.length !== FUNCTION_BODY_PIN.count ||
    new Set(rows.map((row) => row?.signature)).size !==
      FUNCTION_BODY_PIN.count ||
    functionBodiesDigest(rows) !== FUNCTION_BODY_PIN.sha256
  ) {
    throw new Error("W30_PG17_FUNCTION_BODY_MANIFEST_UNPROVEN");
  }
  return true;
}
