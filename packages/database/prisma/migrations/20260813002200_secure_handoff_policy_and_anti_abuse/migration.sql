CREATE TYPE "handoff_standard_method_policy" AS ENUM (
    'PICKUP_CODE',
    'DYNAMIC_QR',
    'EITHER'
);

ALTER TABLE "organizations"
ADD COLUMN "handoff_standard_method_policy" "handoff_standard_method_policy"
NOT NULL DEFAULT 'EITHER';

ALTER TABLE "locations"
ADD COLUMN "handoff_standard_method_policy_override"
"handoff_standard_method_policy";

ALTER TABLE "anti_abuse_events"
DROP CONSTRAINT "anti_abuse_events_scope_check";

ALTER TABLE "anti_abuse_events"
ADD CONSTRAINT "anti_abuse_events_scope_check" CHECK (
    "scope" IN (
        'v1:staff-login-identifier',
        'v1:staff-client-address',
        'v1:guest-client-address',
        'v1:guest-token',
        'v1:handoff-issuance-session',
        'v1:handoff-verification-session'
    )
);
