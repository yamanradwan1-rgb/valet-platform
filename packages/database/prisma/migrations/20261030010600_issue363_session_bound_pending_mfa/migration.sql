-- Issue #363 / DEC-078: authorize pending MFA enrollment only in its initiating StaffAuthSession.
-- A historical PENDING factor cannot be attributed safely. Keep it immutable and
-- fail closed until the existing audited VAYLET operator recovery retires it.

CREATE UNIQUE INDEX "staff_auth_sessions_user_id_id_key"
    ON "staff_auth_sessions"("user_id", "id");

ALTER TABLE "user_mfa_totp_factors"
    ADD COLUMN "pending_enrollment_session_id" UUID,
    ADD CONSTRAINT "user_mfa_totp_factors_pending_session_owner_fkey"
        FOREIGN KEY ("user_id", "pending_enrollment_session_id")
        REFERENCES "staff_auth_sessions"("user_id", "id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

-- NOT VALID retains historic ownerless PENDING rows but enforces the check
-- for every new insertion/update. A legacy PENDING row cannot be confirmed.
ALTER TABLE "user_mfa_totp_factors"
    ADD CONSTRAINT "user_mfa_totp_factors_pending_session_required_check"
    CHECK ("state" <> 'PENDING' OR "pending_enrollment_session_id" IS NOT NULL)
    NOT VALID;

CREATE FUNCTION "mfa_pending_session_owner_guard"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.pending_enrollment_session_id IS DISTINCT FROM OLD.pending_enrollment_session_id THEN
        RAISE EXCEPTION 'MFA pending enrollment session owner is immutable.'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'user_mfa_totp_factors_pending_session_immutable_check';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "user_mfa_totp_factors_pending_session_guard_trigger"
    BEFORE UPDATE ON "user_mfa_totp_factors"
    FOR EACH ROW EXECUTE FUNCTION "mfa_pending_session_owner_guard"();

REVOKE ALL ON FUNCTION "mfa_pending_session_owner_guard"() FROM PUBLIC;
