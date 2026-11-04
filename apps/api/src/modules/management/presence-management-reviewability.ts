/**
 * Authoritative, per-viewer Presence canReview predicate.
 * Both the Management source projection and Issue #414 alert eligibility use
 * aliases e (exception), l (Location), u (requester User), and $3 (viewer ID).
 * Keep this SQL fragment source-owned: pagination must filter it before LIMIT.
 */
export const presenceManagementCanReviewPredicateSql = `(
  e.status='PENDING' AND clock_timestamp()<e.expires_at AND e.user_id<>$3
  AND u.status='ACTIVE' AND EXISTS (
    SELECT 1 FROM organization_memberships m WHERE m.id=e.membership_id
      AND m.organization_id=e.organization_id AND m.user_id=e.user_id
      AND m.role IN ('VALET_EMPLOYEE','VALET_SUPERVISOR')
      AND ((e.action='START' AND m.status='ACTIVE' AND l.status='ACTIVE' AND EXISTS (
        SELECT 1 FROM membership_location_access a WHERE a.membership_id=m.id
          AND a.organization_id=e.organization_id AND a.location_id=e.location_id))
        OR (e.action='END' AND EXISTS (SELECT 1 FROM shifts s WHERE s.id=e.shift_id
          AND s.membership_id=m.id AND s.location_id=e.location_id
          AND s.organization_id=e.organization_id AND s.status='ACTIVE'))))
  AND EXISTS (
    SELECT 1 FROM shift_presence_challenges c
    JOIN shift_presence_operations o ON o.id=c.operation_row_id
    WHERE c.id=e.challenge_id AND c.consumed_at IS NULL
      AND clock_timestamp()<c.expires_at
      AND o.status='PENDING' AND clock_timestamp()<o.expires_at)
)`;
