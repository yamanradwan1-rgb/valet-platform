-- CreateEnum
CREATE TYPE "payment_collection_operation_state" AS ENUM (
    'PREPARED',
    'OUTCOME_UNKNOWN',
    'REFERENCE_ATTACHED',
    'REJECTED',
    'RESOLVED'
);

-- CreateTable
CREATE TABLE "payment_collection_operations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "submission_idempotency_key" TEXT NOT NULL,
    "amount" NUMERIC(14,3) NOT NULL,
    "currency" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "state" "payment_collection_operation_state" NOT NULL,
    "provider_reference" TEXT,
    "safe_result_code" TEXT,
    "dispatch_guarded_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_collection_operations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_collection_operations_submission_key_check" CHECK (
        btrim("submission_idempotency_key") <> ''
    ),
    CONSTRAINT "payment_collection_operations_amount_check" CHECK (
        "amount" > 0
    ),
    CONSTRAINT "payment_collection_operations_currency_check" CHECK (
        "currency" ~ '^[A-Z]{3}$'
    ),
    CONSTRAINT "payment_collection_operations_provider_check" CHECK (
        btrim("provider") <> ''
    ),
    CONSTRAINT "payment_collection_operations_reference_check" CHECK (
        "provider_reference" IS NULL OR btrim("provider_reference") <> ''
    ),
    CONSTRAINT "payment_collection_operations_state_data_check" CHECK (
        (
            "state" = 'PREPARED'
            AND "provider_reference" IS NULL
            AND "dispatch_guarded_at" IS NULL
            AND "resolved_at" IS NULL
        )
        OR (
            "state" = 'OUTCOME_UNKNOWN'
            AND "provider_reference" IS NULL
            AND "dispatch_guarded_at" IS NOT NULL
            AND "resolved_at" IS NULL
        )
        OR (
            "state" = 'REFERENCE_ATTACHED'
            AND "provider_reference" IS NOT NULL
            AND "dispatch_guarded_at" IS NOT NULL
            AND "resolved_at" IS NULL
        )
        OR (
            "state" = 'REJECTED'
            AND "provider_reference" IS NULL
            AND "dispatch_guarded_at" IS NOT NULL
            AND "resolved_at" IS NOT NULL
        )
        OR (
            "state" = 'RESOLVED'
            AND "provider_reference" IS NOT NULL
            AND "dispatch_guarded_at" IS NOT NULL
            AND "resolved_at" IS NOT NULL
        )
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_collection_operations_org_submission_key"
ON "payment_collection_operations"(
    "organization_id",
    "submission_idempotency_key"
);

CREATE UNIQUE INDEX "payment_collection_operations_org_provider_reference_key"
ON "payment_collection_operations"(
    "organization_id",
    "provider",
    "provider_reference"
);

CREATE UNIQUE INDEX "payment_collection_operations_one_unresolved_payment_idx"
ON "payment_collection_operations"("organization_id", "payment_id")
WHERE "state" IN ('PREPARED', 'OUTCOME_UNKNOWN', 'REFERENCE_ATTACHED');

CREATE INDEX "payment_collection_operations_org_payment_history_idx"
ON "payment_collection_operations"(
    "organization_id",
    "payment_id",
    "created_at",
    "id"
);

-- AddForeignKey
ALTER TABLE "payment_collection_operations"
ADD CONSTRAINT "payment_collection_operations_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_collection_operations"
ADD CONSTRAINT "payment_collection_operations_org_payment_id_fkey"
FOREIGN KEY ("organization_id", "payment_id")
REFERENCES "payments"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
