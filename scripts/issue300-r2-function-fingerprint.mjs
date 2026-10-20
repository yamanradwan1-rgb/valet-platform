import assert from "node:assert/strict";

/** SHA256 of all three exact zero-argument provenance guard function bodies.
 * This is computed from PostgreSQL's live pg_proc, not the migration source.
 * Replacing a function body while retaining its OID changes the fingerprint.
 */
export async function readOwnedGuardFunctionHash(admin) {
  const result = await admin.query(
    `SELECT count(*)::int AS count,
            encode(sha256(convert_to(
              string_agg(p.proname || ':' || pg_get_functiondef(p.oid),
                chr(10) ORDER BY p.proname COLLATE "C"), 'UTF8'
            )), 'hex') AS fingerprint
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN (
       'management_pagination_preserve_birth_xid',
       'issue300_prevent_relation_rewrite',
       'issue300_prevent_attribution_rewrite')
       AND pg_get_function_identity_arguments(p.oid)=''`,
  );
  assert.equal(result.rowCount, 1, "Guard function fingerprint query invalid");
  const { count, fingerprint } = result.rows[0];
  assert.equal(count, 3, "Missing or overloaded guard function");
  assert.match(fingerprint, /^[a-f0-9]{64}$/, "Invalid guard function fingerprint");
  return fingerprint;
}
