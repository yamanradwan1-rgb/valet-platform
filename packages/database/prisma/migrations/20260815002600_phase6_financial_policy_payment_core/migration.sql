-- CreateEnum
CREATE TYPE "payment_methods_policy" AS ENUM (
    'CASH_ONLY',
    'DIGITAL_ONLY',
    'CASH_OR_DIGITAL'
);

-- AlterTable
ALTER TABLE "organizations"
ADD COLUMN "valet_service_fee" NUMERIC(14,3) NOT NULL DEFAULT 0,
ADD COLUMN "payment_service_payer" "payment_service_payer" NOT NULL DEFAULT 'CUSTOMER',
ADD COLUMN "payment_methods_policy" "payment_methods_policy" NOT NULL DEFAULT 'CASH_ONLY',
ADD COLUMN "tips_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "validation_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "release_requires_payment" BOOLEAN NOT NULL DEFAULT false,
ADD CONSTRAINT "organizations_valet_service_fee_check" CHECK (
    "valet_service_fee" >= 0
);

-- AlterTable
ALTER TABLE "locations"
ADD COLUMN "valet_service_fee_override" NUMERIC(14,3),
ADD COLUMN "payment_service_payer_override" "payment_service_payer",
ADD COLUMN "payment_methods_policy_override" "payment_methods_policy",
ADD COLUMN "tips_enabled_override" BOOLEAN,
ADD COLUMN "validation_enabled_override" BOOLEAN,
ADD COLUMN "release_requires_payment_override" BOOLEAN,
ADD CONSTRAINT "locations_valet_service_fee_override_check" CHECK (
    "valet_service_fee_override" IS NULL
    OR "valet_service_fee_override" >= 0
);
