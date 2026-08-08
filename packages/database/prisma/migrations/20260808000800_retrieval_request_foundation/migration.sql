-- CreateEnum
CREATE TYPE "retrieval_requester_type" AS ENUM ('CUSTOMER', 'STAFF');

-- CreateEnum
CREATE TYPE "retrieval_request_status" AS ENUM (
    'OPEN',
    'ACCEPTED',
    'CANCELLED',
    'COMPLETED'
);

-- AddCompositeUniqueSupport
CREATE UNIQUE INDEX "valet_sessions_organization_id_id_key"
ON "valet_sessions"("organization_id", "id");

-- CreateTable
CREATE TABLE "retrieval_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "valet_session_id" UUID NOT NULL,
    "requested_by_type" "retrieval_requester_type" NOT NULL,
    "requested_by_customer_id" UUID,
    "requested_by_membership_id" UUID,
    "status" "retrieval_request_status" NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retrieval_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "retrieval_requests_requester_consistency_check" CHECK (
        (
            "requested_by_type" = 'CUSTOMER'
            AND "requested_by_customer_id" IS NOT NULL
            AND "requested_by_membership_id" IS NULL
        )
        OR
        (
            "requested_by_type" = 'STAFF'
            AND "requested_by_membership_id" IS NOT NULL
            AND "requested_by_customer_id" IS NULL
        )
    )
);

-- Prisma schema syntax cannot express this partial unique index.
CREATE UNIQUE INDEX "retrieval_requests_one_active_per_valet_session_idx"
ON "retrieval_requests"("valet_session_id")
WHERE "status" IN ('OPEN', 'ACCEPTED');

-- AddForeignKey
ALTER TABLE "retrieval_requests"
ADD CONSTRAINT "retrieval_requests_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "retrieval_requests"
ADD CONSTRAINT "retrieval_requests_org_valet_session_id_fkey"
FOREIGN KEY ("organization_id", "valet_session_id")
REFERENCES "valet_sessions"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "retrieval_requests"
ADD CONSTRAINT "retrieval_requests_org_requested_by_customer_id_fkey"
FOREIGN KEY ("organization_id", "requested_by_customer_id")
REFERENCES "customers"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "retrieval_requests"
ADD CONSTRAINT "retrieval_requests_org_requested_by_membership_id_fkey"
FOREIGN KEY ("organization_id", "requested_by_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
