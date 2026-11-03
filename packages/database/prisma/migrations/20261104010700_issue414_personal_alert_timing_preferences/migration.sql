-- DEC-109: one typed User + Organization preference set; no read-time insert.
-- An absent row is represented by API defaults/revision 0.
CREATE TABLE public.management_alert_timing_preferences (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  alt01_grace_seconds integer NOT NULL DEFAULT 0,
  alt02_queue_seconds integer NOT NULL DEFAULT 60,
  alt03_decline_seconds integer NOT NULL DEFAULT 0,
  alt04_stage_seconds integer NOT NULL DEFAULT 300,
  alt06_handoff_seconds integer NOT NULL DEFAULT 300,
  alt11_unknown_payment_seconds integer NOT NULL DEFAULT 120,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT management_alert_timing_preferences_pkey
    PRIMARY KEY (organization_id, user_id),
  CONSTRAINT management_alert_timing_preferences_membership_fkey
    FOREIGN KEY (organization_id, user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT management_alert_timing_alt01_check
    CHECK (alt01_grace_seconds BETWEEN 0 AND 60),
  CONSTRAINT management_alert_timing_alt02_check
    CHECK (alt02_queue_seconds BETWEEN 0 AND 300),
  CONSTRAINT management_alert_timing_alt03_check
    CHECK (alt03_decline_seconds BETWEEN 0 AND 120),
  CONSTRAINT management_alert_timing_alt04_check
    CHECK (alt04_stage_seconds BETWEEN 60 AND 900),
  CONSTRAINT management_alert_timing_alt06_check
    CHECK (alt06_handoff_seconds BETWEEN 60 AND 900),
  CONSTRAINT management_alert_timing_alt11_check
    CHECK (alt11_unknown_payment_seconds BETWEEN 60 AND 600),
  CONSTRAINT management_alert_timing_revision_check
    CHECK (revision >= 0)
);

REVOKE ALL ON TABLE public.management_alert_timing_preferences FROM PUBLIC;
