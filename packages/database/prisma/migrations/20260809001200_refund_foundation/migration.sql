-- CreateEnum
CREATE TYPE "refund_status" AS ENUM (
    'PENDING',
    'SUCCEEDED',
    'FAILED'
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount" NUMERIC(14,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "refund_status" NOT NULL,
    "authorized_by_membership_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "provider" TEXT,
    "provider_reference" TEXT,
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "refunds_amount_check" CHECK (
        "amount" > 0
    ),
    CONSTRAINT "refunds_reason_check" CHECK (
        btrim("reason") <> ''
    ),
    CONSTRAINT "refunds_provider_reference_requires_provider_check" CHECK (
        "provider_reference" IS NULL
        OR "provider" IS NOT NULL
    ),
    CONSTRAINT "refunds_status_provider_completion_check" CHECK (
        (
            "status" IN ('PENDING', 'FAILED')
            AND "provider" IS NOT NULL
            AND "completed_at" IS NULL
        )
        OR (
            "status" = 'SUCCEEDED'
            AND "completed_at" IS NOT NULL
            AND (
                (
                    "provider" IS NULL
                    AND "provider_reference" IS NULL
                )
                OR (
                    "provider" IS NOT NULL
                    AND "provider_reference" IS NOT NULL
                )
            )
        )
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "refunds_organization_id_idempotency_key"
ON "refunds"("organization_id", "idempotency_key");

CREATE UNIQUE INDEX "refunds_organization_id_provider_provider_reference_key"
ON "refunds"("organization_id", "provider", "provider_reference");

CREATE UNIQUE INDEX "refunds_organization_id_payment_id_id_key"
ON "refunds"("organization_id", "payment_id", "id");

-- Complete the optional PaymentProviderEvent -> Refund relationship.
ALTER TABLE "payment_provider_events"
DROP CONSTRAINT "payment_provider_events_refund_id_null_check";

-- AddForeignKey
ALTER TABLE "refunds"
ADD CONSTRAINT "refunds_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refunds"
ADD CONSTRAINT "refunds_org_payment_id_fkey"
FOREIGN KEY ("organization_id", "payment_id")
REFERENCES "payments"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refunds"
ADD CONSTRAINT "refunds_org_authorized_by_membership_id_fkey"
FOREIGN KEY ("organization_id", "authorized_by_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_provider_events"
ADD CONSTRAINT "payment_provider_events_org_payment_refund_id_fkey"
FOREIGN KEY ("organization_id", "payment_id", "refund_id")
REFERENCES "refunds"("organization_id", "payment_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
