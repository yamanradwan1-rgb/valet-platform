-- CreateEnum
CREATE TYPE "cash_entry_type" AS ENUM (
    'RECEIPT',
    'ADJUSTMENT_INCREASE',
    'ADJUSTMENT_DECREASE'
);

-- CreateEnum
CREATE TYPE "payment_provider_event_processing_status" AS ENUM (
    'PROCESSED',
    'IGNORED'
);

-- CreateTable
CREATE TABLE "cash_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "entry_type" "cash_entry_type" NOT NULL,
    "amount" NUMERIC(14,3) NOT NULL,
    "received_or_adjusted_by_membership_id" UUID NOT NULL,
    "reason" TEXT,
    "submission_idempotency_key" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cash_entries_amount_check" CHECK (
        "amount" > 0
    ),
    CONSTRAINT "cash_entries_adjustment_reason_check" CHECK (
        "entry_type" = 'RECEIPT'
        OR (
            "reason" IS NOT NULL
            AND btrim("reason") <> ''
        )
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_entries_organization_id_submission_idempotency_key"
ON "cash_entries"("organization_id", "submission_idempotency_key");

-- Prisma schema syntax cannot express this partial unique index.
CREATE UNIQUE INDEX "cash_entries_one_receipt_per_payment_idx"
ON "cash_entries"("payment_id")
WHERE "entry_type" = 'RECEIPT';

-- CreateTable
CREATE TABLE "payment_provider_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "refund_id" UUID,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "provider_reference" TEXT,
    "processing_status" "payment_provider_event_processing_status" NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL,
    "safe_result_code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_provider_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_provider_events_refund_id_null_check" CHECK (
        "refund_id" IS NULL
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_events_org_provider_event_id_key"
ON "payment_provider_events"(
    "organization_id",
    "provider",
    "provider_event_id"
);

-- AddForeignKey
ALTER TABLE "cash_entries"
ADD CONSTRAINT "cash_entries_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cash_entries"
ADD CONSTRAINT "cash_entries_org_payment_id_fkey"
FOREIGN KEY ("organization_id", "payment_id")
REFERENCES "payments"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cash_entries"
ADD CONSTRAINT "cash_entries_org_received_or_adjusted_by_membership_id_fkey"
FOREIGN KEY ("organization_id", "received_or_adjusted_by_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_provider_events"
ADD CONSTRAINT "payment_provider_events_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_provider_events"
ADD CONSTRAINT "payment_provider_events_org_payment_id_fkey"
FOREIGN KEY ("organization_id", "payment_id")
REFERENCES "payments"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
