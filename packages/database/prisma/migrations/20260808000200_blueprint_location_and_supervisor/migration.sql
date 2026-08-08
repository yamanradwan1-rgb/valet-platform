-- AlterEnum
ALTER TYPE "membership_role" ADD VALUE 'VALET_SUPERVISOR' AFTER 'LOCATION_MANAGER';

-- AlterTable
ALTER TABLE "locations"
ADD COLUMN "timezone" TEXT NOT NULL,
ADD COLUMN "currency" TEXT NOT NULL;

-- Location currency follows the uppercase ISO 4217 three-letter contract.
ALTER TABLE "locations"
ADD CONSTRAINT "locations_currency_format_check"
CHECK ("currency" ~ '^[A-Z]{3}$');
