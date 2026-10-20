import assert from "node:assert/strict";

/** Do not owner-sign a synthetic scope on the strength of valid UUID syntax.
 * All allowlisted Audit rows must already exist in the expressly owned
 * Organization/Location; malformed source links remain valid test fixtures.
 * Caller owns a real read-only migration-role PostgreSQL transaction.
 */
export async function requireOwnedScopeEvidence(admin, scopes) {
  const approvedIds = new Set();
  const scopeKeys = new Set();
  for (const scope of scopes) {
    const key = scope.organizationId + ":" + scope.locationId;
    assert(!scopeKeys.has(key), "Duplicate source proof scope");
    scopeKeys.add(key);
    const location = await admin.query(
      "SELECT l.id::text AS id FROM public.locations l " +
        "JOIN public.organizations o ON o.id=l.organization_id " +
        "WHERE o.id=$1::uuid AND l.id=$2::uuid",
      [scope.organizationId, scope.locationId],
    );
    assert.equal(location.rowCount, 1, "Scope is not an owned Organization/Location");
    const ids = scope.approvedAuditEventIds;
    for (const id of ids) {
      assert(!approvedIds.has(id), "Audit proof ID appears in multiple scopes");
      approvedIds.add(id);
    }
    if (ids.length === 0) continue;
    const result = await admin.query(
      "SELECT a.id::text AS id, a.organization_id::text AS organization_id, " +
        "a.location_id::text AS location_id " +
        "FROM public.audit_events a WHERE a.id = ANY($1::uuid[])",
      [ids],
    );
    assert.equal(result.rowCount, ids.length,
      "Approved Audit proof ID is missing from owned database");
    const actual = new Set();
    for (const row of result.rows) {
      assert.equal(row.organization_id, scope.organizationId,
        "Approved Audit ID belongs to another Organization");
      assert.equal(row.location_id, scope.locationId,
        "Approved Audit ID belongs to another Location");
      assert(ids.includes(row.id) && !actual.has(row.id),
        "Unexpected or repeated Audit proof ID");
      actual.add(row.id);
    }
  }
}
