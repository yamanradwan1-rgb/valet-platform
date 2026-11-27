/** Issue #463 P2 fixed cluster-scoped role names, owned by an approved
 * deployment/CI bootstrap. They are not per-test ephemeral identities.
 *
 * The W2 P2 migration still needs an approved, source-pinned role-reuse
 * contract before any shared-cluster test can apply it. Never infer that an
 * existing role is safe merely because its name matches.
 */
export const ISSUE463_SHARED_ROLES = Object.freeze([
  "vaylet_rating_feedback_reader_owner",
  "vaylet_rating_feedback_privacy_owner",
  "vaylet_rating_feedback_privacy_approver",
  "vaylet_rating_feedback_privacy_executor",
]);

// Exact LF-canonical Git blob of W2 committed source 14238ea4, PostgreSQL17
// P2. The Windows CRLF checkout has raw SHA c0d7cc5d... (different bytes).
// A changed normalized source fails closed; no configurable pin or fallback.
export const ISSUE463_P2_REVIEWED_SQL_SHA256 =
  "23213576884348808b85c01bec545787469199e0b8491bbd6ec4fa6d16d05b1a";

const sharedRoles = new Set(ISSUE463_SHARED_ROLES);

export function isIssue463SharedRole(name) {
  return sharedRoles.has(name);
}
