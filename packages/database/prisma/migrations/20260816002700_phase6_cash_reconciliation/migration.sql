ALTER TABLE "shifts"
ADD COLUMN "cash_expected" NUMERIC(14,3),
ADD COLUMN "cash_reported" NUMERIC(14,3),
ADD COLUMN "cash_variance" NUMERIC(14,3),
ADD COLUMN "cash_currency" TEXT,
ADD COLUMN "cash_reported_at" TIMESTAMPTZ(3),
ADD COLUMN "cash_reported_by_membership_id" UUID;

ALTER TABLE "shifts"
ADD CONSTRAINT "shifts_cash_reporter_fkey"
FOREIGN KEY ("organization_id", "cash_reported_by_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shifts"
ADD CONSTRAINT "shifts_cash_reconciliation_check"
CHECK (
  (
    "cash_expected" IS NULL
    AND "cash_reported" IS NULL
    AND "cash_variance" IS NULL
    AND "cash_currency" IS NULL
    AND "cash_reported_at" IS NULL
    AND "cash_reported_by_membership_id" IS NULL
  )
  OR
  (
    "cash_expected" IS NOT NULL
    AND "cash_expected" >= 0
    AND "cash_reported" IS NOT NULL
    AND "cash_reported" >= 0
    AND "cash_variance" IS NOT NULL
    AND "cash_variance" = "cash_reported" - "cash_expected"
    AND "cash_currency" ~ '^[A-Z]{3}$'
    AND "cash_reported_at" IS NOT NULL
    AND "cash_reported_by_membership_id" = "membership_id"
    AND "status" = 'ENDED'
    AND "ended_at" = "cash_reported_at"
  )
);

CREATE FUNCTION prevent_shift_cash_reconciliation_rewrite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.cash_reported_at IS NOT NULL AND (
    NEW.cash_expected IS DISTINCT FROM OLD.cash_expected
    OR NEW.cash_reported IS DISTINCT FROM OLD.cash_reported
    OR NEW.cash_variance IS DISTINCT FROM OLD.cash_variance
    OR NEW.cash_currency IS DISTINCT FROM OLD.cash_currency
    OR NEW.cash_reported_at IS DISTINCT FROM OLD.cash_reported_at
    OR NEW.cash_reported_by_membership_id IS DISTINCT FROM OLD.cash_reported_by_membership_id
    OR NEW.ended_at IS DISTINCT FROM OLD.ended_at
    OR NEW.status IS DISTINCT FROM OLD.status
  ) THEN
    RAISE EXCEPTION 'Shift cash reconciliation snapshot is immutable.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "shifts_cash_reconciliation_immutable"
BEFORE UPDATE ON "shifts"
FOR EACH ROW
EXECUTE FUNCTION prevent_shift_cash_reconciliation_rewrite();

REVOKE ALL ON FUNCTION prevent_shift_cash_reconciliation_rewrite() FROM PUBLIC;
