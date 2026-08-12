-- RefineRequesterConsistency
-- Guest Access is session-bound and a valid guest session may intentionally
-- have no persisted Customer row. Keep STAFF attribution semantics unchanged.
ALTER TABLE "retrieval_requests"
DROP CONSTRAINT "retrieval_requests_requester_consistency_check";

ALTER TABLE "retrieval_requests"
ADD CONSTRAINT "retrieval_requests_requester_consistency_check" CHECK (
    (
        "requested_by_type" = 'CUSTOMER'
        AND "requested_by_membership_id" IS NULL
    )
    OR
    (
        "requested_by_type" = 'STAFF'
        AND "requested_by_membership_id" IS NOT NULL
        AND "requested_by_customer_id" IS NULL
    )
);
