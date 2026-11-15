// Frozen from the exact 29 pinned Issue416 migration SQL sources.
// Removing an immutable/quota/receipt guard must NEVER pass catalog acceptance.
export const REQUIRED_PRIVATE_TRIGGERS = Object.freeze([
  ["vap1_receipt_immutable", "operation_receipts", "deny_receipt_change"],
  ["vap1_keys_immutable_update", "proof_keys", "protect_key_change"],
  ["vap1_selection_monotone", "key_selection", "protect_selection_change"],
  ["vap1_boundary_monotone", "security_boundary", "protect_boundary_change"],
  [
    "vap1_reset_bundle_guard",
    "reset_issue_quota_bundles",
    "reset_issue_quota_guard",
  ],
  [
    "vap1_reset_entry_guard",
    "reset_issue_quota_entries",
    "reset_issue_quota_guard",
  ],
  [
    "vap1_reset_evidence_guard",
    "reset_issue_domain_evidence",
    "reset_issue_quota_guard",
  ],
  [
    "vap1_reset_bundle_integrity",
    "reset_issue_quota_bundles",
    "assert_reset_issue_bundle_integrity",
  ],
  [
    "vap1_reset_entry_integrity",
    "reset_issue_quota_entries",
    "assert_reset_issue_bundle_integrity",
  ],
  [
    "vap1_reset_evidence_source_guard",
    "reset_issue_domain_evidence",
    "validate_reset_issue_domain_evidence",
  ],
  [
    "issue416_reset_credential_db_clock",
    "staff_password_reset_requests",
    "set_reset_credential_db_clock",
  ],
  [
    "issue416_reset_credential_lifecycle",
    "staff_password_reset_requests",
    "guard_reset_credential_lifecycle",
  ],
  [
    "issue416_reset_credential_receipt_guard",
    "staff_password_reset_requests",
    "assert_reset_credential_receipts",
  ],
  [
    "issue416_a01_binding_fingerprint_guard",
    "limiter_bindings",
    "guard_a01_binding_fingerprint",
  ],
  [
    "issue416_reset_redeem_clock_guard",
    "staff_password_reset_requests",
    "enforce_reset_redeem_db_clock",
  ],
  [
    "issue416_reset_redeem_expiry_commit",
    "staff_password_reset_requests",
    "assert_reset_redeem_commit_clock",
  ],
  [
    "issue416_reset_redeem_unproven_guard",
    "staff_password_reset_requests",
    "reject_unbound_reset_redemption",
  ],
  [
    "issue416_reset_quota_terminal_receipt_guard",
    "reset_issue_quota_bundles",
    "assert_reset_quota_terminal_receipt",
  ],
  [
    "issue416_reset_redeem_evidence_immutable",
    "reset_redeem_domain_evidence",
    "deny_reset_redeem_evidence_mutation",
  ],
  [
    "issue416_reset_redeem_evidence_complete",
    "reset_redeem_domain_evidence",
    "assert_exact_reset_redeem_evidence",
  ],
  [
    "issue416_reset_credential_redeem_complete",
    "staff_password_reset_requests",
    "assert_exact_reset_redeem_evidence",
  ],
  [
    "issue416_r03_00_client_unbound",
    "reset_redeem_client_attempts",
    "deny_unbound_r03_attempt",
  ],
  [
    "issue416_r03_10_client_count",
    "reset_redeem_client_attempts",
    "guard_r03_counted_attempt",
  ],
  [
    "issue416_r03_00_credential_unbound",
    "reset_redeem_credential_attempts",
    "deny_unbound_r03_attempt",
  ],
  [
    "issue416_r03_10_credential_count",
    "reset_redeem_credential_attempts",
    "guard_r03_counted_attempt",
  ],
  [
    "issue416_r03_client_immutable",
    "reset_redeem_client_attempts",
    "reject_r03_attempt_mutation",
  ],
  [
    "issue416_r03_credential_immutable",
    "reset_redeem_credential_attempts",
    "reject_r03_attempt_mutation",
  ],
  [
    "issue416_r03_client_no_truncate",
    "reset_redeem_client_attempts",
    "reject_r03_attempt_mutation",
  ],
  [
    "issue416_r03_credential_no_truncate",
    "reset_redeem_credential_attempts",
    "reject_r03_attempt_mutation",
  ],
  [
    "issue416_a01_limiter_insert_stamp",
    "limiter_bindings",
    "stamp_a01_limiter_binding",
  ],
  [
    "issue416_a01_limiter_immutable",
    "limiter_bindings",
    "stamp_a01_limiter_binding",
  ],
  [
    "issue416_a01_original_lineage_immutable",
    "a01_original_lineage",
    "guard_a01_original_lineage",
  ],
]);

export const PRIVATE_TRIGGER_SQL = `
SELECT n.nspname AS schema_name, c.relname AS table_name,
 t.tgname AS trigger_name, t.tgenabled AS enabled,
 t.tgenabled AS tgenabled, t.tgtype,
 p.oid::regprocedure::text AS trigger_function,
 pg_get_triggerdef(t.oid) AS trigger_definition,
 t.tgisinternal AS is_internal,
 pn.nspname || '.' || p.proname AS handler,
 p.pronargs AS handler_args, p.prokind AS handler_kind
FROM pg_trigger t
JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_proc p ON p.oid=t.tgfoid
JOIN pg_namespace pn ON pn.oid=p.pronamespace
WHERE left(n.nspname,11)='auth_proof_' AND NOT t.tgisinternal
ORDER BY n.nspname,c.relname,t.tgname`;

export function assertPrivateTriggers(rows) {
  const names = new Set(
    Array.isArray(rows) ? rows.map((r) => r?.trigger_name) : [],
  );
  if (
    !Array.isArray(rows) ||
    rows.length !== REQUIRED_PRIVATE_TRIGGERS.length ||
    names.size !== rows.length ||
    REQUIRED_PRIVATE_TRIGGERS.some(([name, table, handler]) => {
      const r = rows.find((row) => row?.trigger_name === name);
      return (
        !r ||
        r.schema_name !== "auth_proof_private" ||
        r.table_name !== table ||
        r.handler !== `auth_proof_private.${handler}` ||
        r.enabled !== "O" ||
        r.is_internal !== false ||
        r.handler_args !== 0 ||
        r.handler_kind !== "f"
      );
    })
  ) {
    throw new Error("W30_PG17_PRIVATE_TRIGGER_MANIFEST_UNPROVEN");
  }
  return true;
}
