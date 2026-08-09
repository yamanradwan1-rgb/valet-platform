-- CreateEnum
CREATE TYPE "payment_service_payer" AS ENUM ('CUSTOMER', 'VENUE');

-- CreateEnum
CREATE TYPE "payment_collection_method" AS ENUM ('NONE', 'CASH', 'DIGITAL');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM (
    'NOT_REQUIRED',
    'UNPAID',
    'PENDING',
    'PAID',
    'FAILED'
);

-- CreateEnum
CREATE TYPE "validation_mode" AS ENUM ('NONE', 'FULL', 'PARTIAL');

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "valet_session_id" UUID NOT NULL,
    "service_payer" "payment_service_payer" NOT NULL,
    "collection_method" "payment_collection_method" NOT NULL,
    "currency" TEXT NOT NULL,
    "service_amount" NUMERIC(14,3) NOT NULL,
    "tip_amount" NUMERIC(14,3) NOT NULL,
    "amount_due" NUMERIC(14,3) NOT NULL,
    "amount_paid" NUMERIC(14,3) NOT NULL,
    "status" "payment_status" NOT NULL,
    "creation_idempotency_key" TEXT NOT NULL,
    "provider" TEXT,
    "provider_reference" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_currency_check" CHECK (
        "currency" ~ '^[A-Z]{3}$'
    ),
    CONSTRAINT "payments_money_check" CHECK (
        "service_amount" >= 0
        AND "tip_amount" >= 0
        AND "amount_due" >= 0
        AND "amount_paid" >= 0
        AND "amount_paid" <= "amount_due"
    ),
    CONSTRAINT "payments_venue_amount_due_check" CHECK (
        "service_payer" <> 'VENUE'
        OR "amount_due" = "tip_amount"
    ),
    CONSTRAINT "payments_method_status_check" CHECK (
        (
            "collection_method" = 'NONE'
            AND "status" = 'NOT_REQUIRED'
            AND "amount_due" = 0
            AND "amount_paid" = 0
            AND "provider" IS NULL
            AND "provider_reference" IS NULL
        )
        OR
        (
            "collection_method" = 'CASH'
            AND "provider" IS NULL
            AND "provider_reference" IS NULL
            AND (
                (
                    "status" = 'UNPAID'
                    AND "amount_due" > "amount_paid"
                )
                OR
                (
                    "status" = 'PAID'
                    AND "amount_due" > 0
                    AND "amount_paid" = "amount_due"
                    AND "paid_at" IS NOT NULL
                )
            )
        )
        OR
        (
            "collection_method" = 'DIGITAL'
            AND "provider" IS NOT NULL
            AND (
                (
                    "status" = 'UNPAID'
                    AND "amount_due" > "amount_paid"
                )
                OR
                (
                    "status" = 'PENDING'
                    AND "provider_reference" IS NOT NULL
                    AND "amount_paid" = 0
                )
                OR
                (
                    "status" = 'FAILED'
                    AND "amount_due" > "amount_paid"
                )
                OR
                (
                    "status" = 'PAID'
                    AND "provider_reference" IS NOT NULL
                    AND "amount_due" > 0
                    AND "amount_paid" = "amount_due"
                    AND "paid_at" IS NOT NULL
                )
            )
        )
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_organization_id_valet_session_id_key"
ON "payments"("organization_id", "valet_session_id");

CREATE UNIQUE INDEX "payments_organization_id_creation_idempotency_key"
ON "payments"("organization_id", "creation_idempotency_key");

CREATE UNIQUE INDEX "payments_organization_id_provider_provider_reference_key"
ON "payments"("organization_id", "provider", "provider_reference");

CREATE UNIQUE INDEX "payments_organization_id_id_key"
ON "payments"("organization_id", "id");

-- CreateTable
CREATE TABLE "validations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "mode" "validation_mode" NOT NULL,
    "amount" NUMERIC(14,3) NOT NULL,
    "is_current" BOOLEAN NOT NULL,
    "supersedes_validation_id" UUID,
    "applied_by_membership_id" UUID NOT NULL,
    "applied_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "validations_mode_amount_check" CHECK (
        (
            "mode" = 'NONE'
            AND "amount" = 0
            AND "supersedes_validation_id" IS NOT NULL
        )
        OR
        (
            "mode" IN ('FULL', 'PARTIAL')
            AND "amount" > 0
        )
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "validations_organization_id_payment_id_id_key"
ON "validations"("organization_id", "payment_id", "id");

-- Prisma schema syntax cannot express this partial unique index.
CREATE UNIQUE INDEX "validations_one_current_per_payment_idx"
ON "validations"("payment_id")
WHERE "is_current" = true;

-- AddForeignKey
ALTER TABLE "payments"
ADD CONSTRAINT "payments_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments"
ADD CONSTRAINT "payments_org_location_id_fkey"
FOREIGN KEY ("organization_id", "location_id")
REFERENCES "locations"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments"
ADD CONSTRAINT "payments_org_location_valet_session_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id")
REFERENCES "valet_sessions"("organization_id", "location_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "validations"
ADD CONSTRAINT "validations_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "validations"
ADD CONSTRAINT "validations_org_payment_id_fkey"
FOREIGN KEY ("organization_id", "payment_id")
REFERENCES "payments"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "validations"
ADD CONSTRAINT "validations_org_applied_by_membership_id_fkey"
FOREIGN KEY ("organization_id", "applied_by_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "validations"
ADD CONSTRAINT "validations_org_payment_supersedes_id_fkey"
FOREIGN KEY ("organization_id", "payment_id", "supersedes_validation_id")
REFERENCES "validations"("organization_id", "payment_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
