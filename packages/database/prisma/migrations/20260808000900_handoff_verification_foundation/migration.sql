-- CreateEnum
CREATE TYPE "handoff_verification_method" AS ENUM (
    'PICKUP_CODE',
    'DYNAMIC_QR',
    'SUPERVISOR_OVERRIDE'
);

-- CreateTable
CREATE TABLE "handoff_verifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "valet_session_id" UUID NOT NULL,
    "method" "handoff_verification_method" NOT NULL,
    "secret_hash" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL,
    "verified_at" TIMESTAMPTZ(3),
    "verified_by_membership_id" UUID,
    "consumed_at" TIMESTAMPTZ(3),
    "override_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handoff_verifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "handoff_verifications_pickup_code_check" CHECK (
        "method" <> 'PICKUP_CODE'
        OR (
            "secret_hash" IS NOT NULL
            AND "expires_at" IS NOT NULL
            AND "attempt_count" >= 0
            AND "max_attempts" > 0
        )
    ),
    CONSTRAINT "handoff_verifications_dynamic_qr_check" CHECK (
        "method" <> 'DYNAMIC_QR'
        OR (
            "secret_hash" IS NOT NULL
            AND "expires_at" IS NOT NULL
        )
    ),
    CONSTRAINT "handoff_verifications_supervisor_override_check" CHECK (
        "method" <> 'SUPERVISOR_OVERRIDE'
        OR (
            "verified_by_membership_id" IS NOT NULL
            AND "override_reason" IS NOT NULL
            AND "override_reason" = btrim("override_reason")
            AND "override_reason" <> ''
        )
    )
);

-- AddForeignKey
ALTER TABLE "handoff_verifications"
ADD CONSTRAINT "handoff_verifications_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "handoff_verifications"
ADD CONSTRAINT "handoff_verifications_org_valet_session_id_fkey"
FOREIGN KEY ("organization_id", "valet_session_id")
REFERENCES "valet_sessions"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "handoff_verifications"
ADD CONSTRAINT "handoff_verifications_org_verified_by_membership_id_fkey"
FOREIGN KEY ("organization_id", "verified_by_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
