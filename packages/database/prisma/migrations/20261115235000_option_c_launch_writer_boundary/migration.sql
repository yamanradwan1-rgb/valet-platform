-- Option C only: durable, one-way gate preventing legacy SQL runtime grants
-- from returning after the protected-writer cutover. It does NOT activate any
-- writer, Password Reset, VAP1 purpose, or protected route by itself.
BEGIN;
SET ROLE vap1_proof_owner;

CREATE TABLE auth_proof_private.option_c_launch_boundary (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  phase text NOT NULL DEFAULT 'LEGACY' CHECK (phase IN ('LEGACY', 'PROTECTED')),
  promoted_at timestamptz(6),
  CHECK (
    (phase = 'LEGACY' AND promoted_at IS NULL) OR
    (phase = 'PROTECTED' AND promoted_at IS NOT NULL)
  )
);
INSERT INTO auth_proof_private.option_c_launch_boundary(singleton, phase)
VALUES (true, 'LEGACY');

CREATE FUNCTION auth_proof_private.option_c_phase_monotonic()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.phase = 'PROTECTED'
     AND (NEW.phase IS DISTINCT FROM OLD.phase
          OR NEW.promoted_at IS DISTINCT FROM OLD.promoted_at) THEN
    RAISE EXCEPTION 'Option C protected boundary is irreversible'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER option_c_phase_monotonic
BEFORE UPDATE ON auth_proof_private.option_c_launch_boundary
FOR EACH ROW EXECUTE FUNCTION auth_proof_private.option_c_phase_monotonic();

REVOKE ALL ON TABLE auth_proof_private.option_c_launch_boundary FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.option_c_phase_monotonic() FROM PUBLIC;
RESET ROLE;
COMMIT;
