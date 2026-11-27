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

// Exact LF-canonical reviewed Issue463 P2 with approval precision fence.
// A changed normalized source fails closed; no configurable pin or fallback.
export const ISSUE463_P2_REVIEWED_SQL_SHA256 =
  "70da2ce34c04a26ea2252e4993a8b1a4958a372e83fbd7df5419ccefd80cdf2f";

const sharedRoles = new Set(ISSUE463_SHARED_ROLES);

export function isIssue463SharedRole(name) {
  return sharedRoles.has(name);
}
