-- DEC-099 / GPS-A only. No Shift commands or public configuration activation.
CREATE TYPE public.shift_presence_mode AS ENUM ('OFF','WARN_ONLY','REQUIRE','REQUIRE_OR_OVERRIDE');
CREATE TYPE public.shift_presence_action AS ENUM ('START','END');
CREATE TYPE public.shift_presence_zone_state AS ENUM ('ACTIVE','DISABLED');
CREATE TYPE public.shift_presence_operation_status AS ENUM ('PENDING','COMMITTED','DENIED','EXPIRED');
CREATE TYPE public.shift_presence_classification AS ENUM
  ('CONFIDENT_INSIDE','CONFIDENT_OUTSIDE','AMBIGUOUS_EDGE','CONFIGURATION_UNUSABLE','MEASUREMENT_UNUSABLE');
CREATE TYPE public.shift_presence_reason AS ENUM
  ('INSIDE','OUTSIDE','EDGE','NO_ACTIVE_ZONE','INVALID_CONFIGURATION','INVALID_FIX','INACCURATE_FIX','STALE_FIX','FUTURE_FIX');
CREATE TYPE public.shift_presence_band AS ENUM ('ACCEPTABLE','UNUSABLE','NOT_EVALUATED');
CREATE TYPE public.shift_presence_exception_status AS ENUM ('PENDING','APPROVED','REJECTED','EXPIRED','CONSUMED');
CREATE TYPE public.shift_presence_exception_reason AS ENUM
  ('LOCATION_UNAVAILABLE','GPS_UNAVAILABLE','OUTSIDE_ZONE','AMBIGUOUS_FIX');

ALTER TABLE public.organizations
  ADD COLUMN shift_start_presence_mode public.shift_presence_mode NOT NULL DEFAULT 'OFF',
  ADD COLUMN shift_end_presence_mode public.shift_presence_mode NOT NULL DEFAULT 'OFF',
  ADD COLUMN shift_presence_max_accuracy_meters INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN shift_presence_max_fix_age_seconds INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN shift_presence_revision INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT organizations_presence_accuracy CHECK (shift_presence_max_accuracy_meters BETWEEN 1 AND 200),
  ADD CONSTRAINT organizations_presence_age CHECK (shift_presence_max_fix_age_seconds BETWEEN 1 AND 120),
  ADD CONSTRAINT organizations_presence_revision CHECK (shift_presence_revision > 0),
  ADD CONSTRAINT organizations_presence_gps_a_off CHECK
    (shift_start_presence_mode='OFF' AND shift_end_presence_mode='OFF');
ALTER TABLE public.locations
  ADD COLUMN shift_start_presence_mode_override public.shift_presence_mode,
  ADD COLUMN shift_end_presence_mode_override public.shift_presence_mode,
  ADD COLUMN shift_presence_max_accuracy_meters_override INTEGER,
  ADD COLUMN shift_presence_max_fix_age_seconds_override INTEGER,
  ADD COLUMN shift_presence_revision INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT locations_presence_accuracy CHECK (shift_presence_max_accuracy_meters_override BETWEEN 1 AND 200),
  ADD CONSTRAINT locations_presence_age CHECK (shift_presence_max_fix_age_seconds_override BETWEEN 1 AND 120),
  ADD CONSTRAINT locations_presence_revision CHECK (shift_presence_revision > 0),
  ADD CONSTRAINT locations_presence_gps_a_off CHECK
    ((shift_start_presence_mode_override IS NULL OR shift_start_presence_mode_override='OFF')
     AND (shift_end_presence_mode_override IS NULL OR shift_end_presence_mode_override='OFF'));

CREATE UNIQUE INDEX organization_memberships_presence_identity_key
  ON public.organization_memberships(organization_id,id,user_id);
CREATE UNIQUE INDEX shifts_presence_scope_key
  ON public.shifts(organization_id,location_id,membership_id,id);

CREATE TABLE public.shift_presence_zones (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  location_id UUID NOT NULL,
  code TEXT NOT NULL CHECK (code=btrim(code) AND length(code) BETWEEN 1 AND 64 AND code !~ '^[[:space:]]*$'),
  label TEXT NOT NULL CHECK (label=btrim(label) AND length(label) BETWEEN 1 AND 200 AND label !~ '^[[:space:]]*$'),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  radius_meters DOUBLE PRECISION NOT NULL CHECK (radius_meters BETWEEN 5 AND 1000),
  state public.shift_presence_zone_state NOT NULL DEFAULT 'ACTIVE',
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT shift_presence_zones_scope_key UNIQUE(organization_id,location_id,id),
  CONSTRAINT shift_presence_zones_code_key UNIQUE(location_id,code),
  CONSTRAINT shift_presence_zones_location_fkey FOREIGN KEY(organization_id,location_id)
    REFERENCES public.locations(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX shift_presence_zones_location_state_idx ON public.shift_presence_zones(location_id,state);

CREATE TABLE public.shift_presence_operations (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  location_id UUID NOT NULL,
  user_id UUID NOT NULL,
  membership_id UUID NOT NULL,
  operation_id UUID NOT NULL,
  action public.shift_presence_action NOT NULL,
  shift_id UUID,
  target_fingerprint TEXT NOT NULL CHECK (target_fingerprint ~ '^[0-9a-f]{64}$'),
  request_fingerprint TEXT CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  status public.shift_presence_operation_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp()+INTERVAL '300 seconds',
  terminal_at TIMESTAMPTZ(3),
  result_shift_id UUID,
  result_decision_id UUID,
  CONSTRAINT shift_presence_operations_user_operation_key UNIQUE(user_id,operation_id),
  CONSTRAINT shift_presence_operations_scope_key UNIQUE(organization_id,location_id,user_id,membership_id,action,id),
  CONSTRAINT shift_presence_operations_target_check CHECK ((action='START' AND shift_id IS NULL) OR (action='END' AND shift_id IS NOT NULL)),
  CONSTRAINT shift_presence_operations_expiry_check CHECK (expires_at>created_at AND expires_at<=created_at+INTERVAL '300 seconds'),
  CONSTRAINT shift_presence_operations_terminal_check CHECK
    ((status='PENDING' AND terminal_at IS NULL AND result_shift_id IS NULL AND result_decision_id IS NULL)
     OR (status<>'PENDING' AND terminal_at IS NOT NULL AND terminal_at>=created_at
       AND ((status='COMMITTED' AND request_fingerprint IS NOT NULL AND result_shift_id IS NOT NULL AND result_decision_id IS NOT NULL)
         OR (status IN ('DENIED','EXPIRED') AND result_shift_id IS NULL)))),
  CONSTRAINT shift_presence_operations_location_fkey FOREIGN KEY(organization_id,location_id)
    REFERENCES public.locations(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT shift_presence_operations_member_fkey FOREIGN KEY(organization_id,membership_id,user_id)
    REFERENCES public.organization_memberships(organization_id,id,user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT shift_presence_operations_shift_fkey FOREIGN KEY(organization_id,location_id,membership_id,shift_id)
    REFERENCES public.shifts(organization_id,location_id,membership_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT shift_presence_operations_result_shift_fkey FOREIGN KEY(organization_id,location_id,membership_id,result_shift_id)
    REFERENCES public.shifts(organization_id,location_id,membership_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX shift_presence_operations_expiry_idx ON public.shift_presence_operations(status,expires_at);
CREATE INDEX shift_presence_operations_terminal_idx ON public.shift_presence_operations(terminal_at);

CREATE TABLE public.shift_presence_challenges (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  location_id UUID NOT NULL,
  user_id UUID NOT NULL,
  membership_id UUID NOT NULL,
  action public.shift_presence_action NOT NULL,
  shift_id UUID,
  operation_row_id UUID NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp()+INTERVAL '300 seconds',
  consumed_at TIMESTAMPTZ(3),
  decision_id UUID,
  CONSTRAINT shift_presence_challenges_target_check CHECK ((action='START' AND shift_id IS NULL) OR (action='END' AND shift_id IS NOT NULL)),
  CONSTRAINT shift_presence_challenges_expiry_check CHECK (expires_at>issued_at AND expires_at<=issued_at+INTERVAL '300 seconds'),
  CONSTRAINT shift_presence_challenges_consumption_check CHECK
    ((consumed_at IS NULL AND decision_id IS NULL) OR (consumed_at IS NOT NULL AND consumed_at>=issued_at AND consumed_at<expires_at AND decision_id IS NOT NULL)),
  CONSTRAINT shift_presence_challenges_operation_fkey FOREIGN KEY(organization_id,location_id,user_id,membership_id,action,operation_row_id)
    REFERENCES public.shift_presence_operations(organization_id,location_id,user_id,membership_id,action,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT shift_presence_challenges_shift_fkey FOREIGN KEY(organization_id,location_id,membership_id,shift_id)
    REFERENCES public.shifts(organization_id,location_id,membership_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX shift_presence_challenges_expiry_idx ON public.shift_presence_challenges(expires_at);

CREATE TABLE public.shift_presence_exceptions (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  location_id UUID NOT NULL,
  user_id UUID NOT NULL,
  membership_id UUID NOT NULL,
  action public.shift_presence_action NOT NULL,
  shift_id UUID,
  challenge_id UUID NOT NULL,
  reason public.shift_presence_exception_reason NOT NULL,
  status public.shift_presence_exception_status NOT NULL DEFAULT 'PENDING',
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision>0),
  requested_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ(3) NOT NULL,
  reviewed_at TIMESTAMPTZ(3),
  reviewer_membership_id UUID,
  reviewer_user_id UUID,
  terminal_at TIMESTAMPTZ(3),
  consumed_decision_id UUID,
  CONSTRAINT shift_presence_exceptions_scope_key UNIQUE(organization_id,location_id,user_id,membership_id,action,id),
  CONSTRAINT shift_presence_exceptions_challenge_key UNIQUE(user_id,challenge_id),
  CONSTRAINT shift_presence_exceptions_target_check CHECK ((action='START' AND shift_id IS NULL) OR (action='END' AND shift_id IS NOT NULL)),
  CONSTRAINT shift_presence_exceptions_expiry_check CHECK (expires_at>requested_at AND expires_at<=requested_at+INTERVAL '300 seconds'),
  CONSTRAINT shift_presence_exceptions_review_check CHECK
    ((reviewed_at IS NULL AND reviewer_membership_id IS NULL AND reviewer_user_id IS NULL)
     OR (reviewed_at IS NOT NULL AND reviewed_at>=requested_at AND reviewer_membership_id IS NOT NULL AND reviewer_user_id IS NOT NULL AND reviewer_user_id<>user_id)),
  CONSTRAINT shift_presence_exceptions_state_check CHECK
    ((status='PENDING' AND reviewed_at IS NULL AND terminal_at IS NULL AND consumed_decision_id IS NULL)
      OR (status='APPROVED' AND reviewed_at IS NOT NULL AND reviewed_at<expires_at AND terminal_at IS NULL AND consumed_decision_id IS NULL)
      OR (status='REJECTED' AND reviewed_at IS NOT NULL AND terminal_at IS NOT NULL AND terminal_at=reviewed_at AND consumed_decision_id IS NULL)
      OR (status='EXPIRED' AND terminal_at IS NOT NULL AND terminal_at>=expires_at AND consumed_decision_id IS NULL)
      OR (status='CONSUMED' AND reviewed_at IS NOT NULL AND terminal_at IS NOT NULL AND terminal_at>=reviewed_at AND terminal_at<expires_at AND consumed_decision_id IS NOT NULL)),
  CONSTRAINT shift_presence_exceptions_location_fkey FOREIGN KEY(organization_id,location_id)
    REFERENCES public.locations(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT shift_presence_exceptions_member_fkey FOREIGN KEY(organization_id,membership_id,user_id)
    REFERENCES public.organization_memberships(organization_id,id,user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT shift_presence_exceptions_reviewer_fkey FOREIGN KEY(organization_id,reviewer_membership_id,reviewer_user_id)
    REFERENCES public.organization_memberships(organization_id,id,user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT shift_presence_exceptions_shift_fkey FOREIGN KEY(organization_id,location_id,membership_id,shift_id)
    REFERENCES public.shifts(organization_id,location_id,membership_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX shift_presence_exceptions_queue_idx ON public.shift_presence_exceptions(organization_id,location_id,status,requested_at,id);
CREATE INDEX shift_presence_exceptions_terminal_idx ON public.shift_presence_exceptions(terminal_at);

CREATE TABLE public.shift_presence_decisions (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  location_id UUID NOT NULL,
  user_id UUID NOT NULL,
  membership_id UUID NOT NULL,
  action public.shift_presence_action NOT NULL,
  shift_id UUID,
  operation_id UUID NOT NULL,
  challenge_id UUID NOT NULL,
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  policy_fingerprint TEXT NOT NULL CHECK (policy_fingerprint ~ '^[0-9a-f]{64}$'),
  applied_mode public.shift_presence_mode NOT NULL,
  company_policy_revision INTEGER NOT NULL CHECK (company_policy_revision>0),
  location_policy_revision INTEGER NOT NULL CHECK (location_policy_revision>0),
  zone_id UUID,
  zone_revision INTEGER,
  classification public.shift_presence_classification NOT NULL,
  reason public.shift_presence_reason NOT NULL,
  accuracy_band public.shift_presence_band NOT NULL,
  freshness_band public.shift_presence_band NOT NULL,
  exception_id UUID,
  decided_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT shift_presence_decisions_scope_key UNIQUE(organization_id,location_id,user_id,membership_id,action,id),
  CONSTRAINT shift_presence_decisions_operation_key UNIQUE(user_id,operation_id),
  CONSTRAINT shift_presence_decisions_challenge_key UNIQUE(challenge_id),
  CONSTRAINT shift_presence_decisions_target_check CHECK (action='START' OR shift_id IS NOT NULL),
  CONSTRAINT shift_presence_decisions_zone_check CHECK ((zone_id IS NULL AND zone_revision IS NULL) OR (zone_id IS NOT NULL AND zone_revision IS NOT NULL AND zone_revision>0)),
  CONSTRAINT shift_presence_decisions_reason_check CHECK
    ((classification='CONFIDENT_INSIDE' AND reason='INSIDE')
     OR (classification='CONFIDENT_OUTSIDE' AND reason='OUTSIDE')
     OR (classification='AMBIGUOUS_EDGE' AND reason='EDGE')
     OR (classification='CONFIGURATION_UNUSABLE' AND reason IN ('NO_ACTIVE_ZONE','INVALID_CONFIGURATION'))
     OR (classification='MEASUREMENT_UNUSABLE' AND reason IN ('INVALID_FIX','INACCURATE_FIX','STALE_FIX','FUTURE_FIX'))),
  CONSTRAINT shift_presence_decisions_band_check CHECK
    ((classification='CONFIGURATION_UNUSABLE')
     OR (classification IN ('CONFIDENT_INSIDE','CONFIDENT_OUTSIDE','AMBIGUOUS_EDGE') AND accuracy_band='ACCEPTABLE' AND freshness_band='ACCEPTABLE')
     OR (reason='INVALID_FIX' AND accuracy_band='UNUSABLE' AND freshness_band='UNUSABLE')
     OR (reason='INACCURATE_FIX' AND accuracy_band='UNUSABLE' AND freshness_band='NOT_EVALUATED')
     OR (reason IN ('STALE_FIX','FUTURE_FIX') AND accuracy_band='ACCEPTABLE' AND freshness_band='UNUSABLE')),
  CONSTRAINT shift_presence_decisions_location_fkey FOREIGN KEY(organization_id,location_id)
    REFERENCES public.locations(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT shift_presence_decisions_member_fkey FOREIGN KEY(organization_id,membership_id,user_id)
    REFERENCES public.organization_memberships(organization_id,id,user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT shift_presence_decisions_shift_fkey FOREIGN KEY(organization_id,location_id,membership_id,shift_id)
    REFERENCES public.shifts(organization_id,location_id,membership_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT shift_presence_decisions_zone_fkey FOREIGN KEY(organization_id,location_id,zone_id)
    REFERENCES public.shift_presence_zones(organization_id,location_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT shift_presence_decisions_exception_fkey FOREIGN KEY(organization_id,location_id,user_id,membership_id,action,exception_id)
    REFERENCES public.shift_presence_exceptions(organization_id,location_id,user_id,membership_id,action,id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX shift_presence_decisions_history_idx ON public.shift_presence_decisions(organization_id,location_id,decided_at,id);
CREATE INDEX shift_presence_decisions_retention_idx ON public.shift_presence_decisions(decided_at);

ALTER TABLE public.shift_presence_operations ADD CONSTRAINT shift_presence_operations_decision_fkey
  FOREIGN KEY(organization_id,location_id,user_id,membership_id,action,result_decision_id)
  REFERENCES public.shift_presence_decisions(organization_id,location_id,user_id,membership_id,action,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.shift_presence_challenges ADD CONSTRAINT shift_presence_challenges_decision_fkey
  FOREIGN KEY(organization_id,location_id,user_id,membership_id,action,decision_id)
  REFERENCES public.shift_presence_decisions(organization_id,location_id,user_id,membership_id,action,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
-- Exception's consumed decision selector is validated by the lifecycle trigger.
-- Avoid a cyclic history FK that would make privileged 24-month purge impossible.

-- No ephemeral/history FK in the opposite direction: maintenance can purge
-- challenge/operation rows without losing a Decision's non-secret explanation.
CREATE FUNCTION public.shift_presence_guard_policy() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_changed BOOLEAN;
BEGIN
  IF TG_TABLE_NAME='organizations' THEN
    v_changed := (NEW.shift_start_presence_mode,NEW.shift_end_presence_mode,
      NEW.shift_presence_max_accuracy_meters,NEW.shift_presence_max_fix_age_seconds)
      IS DISTINCT FROM (OLD.shift_start_presence_mode,OLD.shift_end_presence_mode,
      OLD.shift_presence_max_accuracy_meters,OLD.shift_presence_max_fix_age_seconds);
  ELSE
    v_changed := (NEW.shift_start_presence_mode_override,NEW.shift_end_presence_mode_override,
      NEW.shift_presence_max_accuracy_meters_override,NEW.shift_presence_max_fix_age_seconds_override)
      IS DISTINCT FROM (OLD.shift_start_presence_mode_override,OLD.shift_end_presence_mode_override,
      OLD.shift_presence_max_accuracy_meters_override,OLD.shift_presence_max_fix_age_seconds_override);
  END IF;
  IF NEW.shift_presence_revision<>OLD.shift_presence_revision THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence revision is database owned.';
  END IF;
  IF v_changed THEN NEW.shift_presence_revision:=OLD.shift_presence_revision+1; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER organizations_presence_revision BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.shift_presence_guard_policy();
CREATE TRIGGER locations_presence_revision BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.shift_presence_guard_policy();

CREATE FUNCTION public.shift_presence_guard_history() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_now TIMESTAMPTZ:=clock_timestamp(); v_allowed BOOLEAN:=false;
BEGIN
  IF TG_OP='DELETE' THEN
    IF TG_TABLE_NAME='shift_presence_zones' THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Disable presence zones instead of deleting.';
    ELSIF TG_TABLE_NAME='shift_presence_challenges' THEN
      v_allowed:=OLD.consumed_at IS NOT NULL OR v_now>=OLD.expires_at+INTERVAL '24 hours';
    ELSIF TG_TABLE_NAME='shift_presence_operations' THEN
      v_allowed:=OLD.terminal_at IS NOT NULL AND (v_now AT TIME ZONE 'UTC')>=(OLD.terminal_at AT TIME ZONE 'UTC')+INTERVAL '90 days';
    ELSIF TG_TABLE_NAME='shift_presence_exceptions' THEN
      v_allowed:=OLD.terminal_at IS NOT NULL AND (v_now AT TIME ZONE 'UTC')>=(OLD.terminal_at AT TIME ZONE 'UTC')+INTERVAL '24 months';
    ELSE
      v_allowed:=(v_now AT TIME ZONE 'UTC')>=(OLD.decided_at AT TIME ZONE 'UTC')+INTERVAL '24 months';
    END IF;
    IF NOT v_allowed THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence retention has not elapsed.'; END IF;
    RETURN OLD;
  END IF;
  IF TG_TABLE_NAME='shift_presence_decisions' THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence decisions are immutable.';
  END IF;
  IF (NEW.id,NEW.organization_id,NEW.location_id) IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.location_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence identity is immutable.';
  END IF;
  IF TG_TABLE_NAME='shift_presence_zones' THEN
    IF NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence zone CAS revision required.';
    END IF;
    NEW.updated_at:=greatest(v_now,OLD.updated_at+INTERVAL '1 millisecond');
    RETURN NEW;
  END IF;
  IF (NEW.user_id,NEW.membership_id,NEW.action,NEW.shift_id) IS DISTINCT FROM (OLD.user_id,OLD.membership_id,OLD.action,OLD.shift_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence actor/target is immutable.';
  END IF;
  IF TG_TABLE_NAME='shift_presence_operations' THEN
    IF OLD.status<>'PENDING'
      OR (NEW.operation_id,NEW.target_fingerprint,NEW.created_at,NEW.expires_at)
        IS DISTINCT FROM (OLD.operation_id,OLD.target_fingerprint,OLD.created_at,OLD.expires_at)
      OR (OLD.request_fingerprint IS NOT NULL AND NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint) THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence operation terminal fact is immutable.';
    END IF;
    IF NEW.status='PENDING' THEN
      IF OLD.request_fingerprint IS NOT NULL OR NEW.request_fingerprint IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence attempt binding is single-use.';
      END IF;
      RETURN NEW;
    END IF;
    NEW.terminal_at:=v_now;
    IF NEW.status='EXPIRED' AND v_now<OLD.expires_at THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence operation has not expired.';
    END IF;
    IF NEW.action='END' AND NEW.status='COMMITTED' AND NEW.result_shift_id<>NEW.shift_id THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence END result must match target.';
    END IF;
    IF NEW.result_decision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.shift_presence_decisions d
      WHERE d.id=NEW.result_decision_id AND d.operation_id=NEW.operation_id
        AND d.request_fingerprint=NEW.request_fingerprint
        AND (NEW.status<>'COMMITTED' OR d.shift_id=NEW.result_shift_id)
    ) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence result identity mismatch.'; END IF;
  ELSIF TG_TABLE_NAME='shift_presence_challenges' THEN
    IF OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL
      OR (NEW.operation_row_id,NEW.issued_at,NEW.expires_at) IS DISTINCT FROM (OLD.operation_row_id,OLD.issued_at,OLD.expires_at)
      OR v_now>=OLD.expires_at THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence challenge cannot be consumed.';
    END IF;
    NEW.consumed_at:=v_now;
    IF NOT EXISTS (SELECT 1 FROM public.shift_presence_decisions d
      WHERE d.id=NEW.decision_id AND d.challenge_id=OLD.id
        AND (OLD.action='START' OR d.shift_id=OLD.shift_id)) THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence challenge decision mismatch.';
    END IF;
  ELSE
    IF OLD.status IN ('REJECTED','EXPIRED','CONSUMED') OR NEW.revision<>OLD.revision+1
      OR (NEW.challenge_id,NEW.reason,NEW.requested_at,NEW.expires_at) IS DISTINCT FROM (OLD.challenge_id,OLD.reason,OLD.requested_at,OLD.expires_at)
      OR NOT ((OLD.status='PENDING' AND NEW.status IN ('APPROVED','REJECTED','EXPIRED'))
        OR (OLD.status='APPROVED' AND NEW.status IN ('CONSUMED','EXPIRED')))
      OR (OLD.status='APPROVED' AND (NEW.reviewed_at,NEW.reviewer_user_id,NEW.reviewer_membership_id)
        IS DISTINCT FROM (OLD.reviewed_at,OLD.reviewer_user_id,OLD.reviewer_membership_id)) THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence exception transition invalid.';
    END IF;
    IF NEW.status IN ('APPROVED','REJECTED') THEN NEW.reviewed_at:=v_now; END IF;
    IF NEW.status IN ('CONSUMED','REJECTED','EXPIRED') THEN NEW.terminal_at:=v_now; END IF;
    IF NEW.status='CONSUMED' AND NOT EXISTS (SELECT 1 FROM public.shift_presence_decisions d
      WHERE d.id=NEW.consumed_decision_id AND d.exception_id=OLD.id
        AND (d.organization_id,d.location_id,d.user_id,d.membership_id,d.action)
          =(OLD.organization_id,OLD.location_id,OLD.user_id,OLD.membership_id,OLD.action)
        AND (OLD.action='START' OR d.shift_id=OLD.shift_id)) THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence exception decision mismatch.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION public.shift_presence_guard_linkage() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_now TIMESTAMPTZ(3):=clock_timestamp();
BEGIN
  IF TG_TABLE_NAME='shift_presence_operations' THEN
    NEW.created_at:=v_now; NEW.expires_at:=v_now+INTERVAL '300 seconds';
    IF NEW.status<>'PENDING' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence operation must begin pending.'; END IF;
  ELSIF TG_TABLE_NAME='shift_presence_zones' THEN
    NEW.created_at:=v_now; NEW.updated_at:=v_now;
  ELSIF TG_TABLE_NAME='shift_presence_challenges' THEN
    NEW.issued_at:=v_now;
    SELECT o.expires_at INTO NEW.expires_at FROM public.shift_presence_operations o
    WHERE (o.organization_id,o.location_id,o.user_id,o.membership_id,o.action,o.id)
      =(NEW.organization_id,NEW.location_id,NEW.user_id,NEW.membership_id,NEW.action,NEW.operation_row_id)
      AND o.shift_id IS NOT DISTINCT FROM NEW.shift_id AND o.status='PENDING' AND o.expires_at>v_now;
    IF NOT FOUND OR NEW.consumed_at IS NOT NULL OR NEW.decision_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence challenge operation mismatch.';
    END IF;
  ELSIF TG_TABLE_NAME='shift_presence_exceptions' THEN
    NEW.requested_at:=v_now;
    SELECT c.expires_at INTO NEW.expires_at FROM public.shift_presence_challenges c
    JOIN public.shift_presence_operations o ON o.id=c.operation_row_id
    WHERE (c.organization_id,c.location_id,c.user_id,c.membership_id,c.action,c.id)
      =(NEW.organization_id,NEW.location_id,NEW.user_id,NEW.membership_id,NEW.action,NEW.challenge_id)
      AND c.shift_id IS NOT DISTINCT FROM NEW.shift_id AND c.consumed_at IS NULL AND c.expires_at>v_now
      AND o.status='PENDING';
    IF NOT FOUND OR NEW.status<>'PENDING' OR NEW.revision<>1 THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence exception challenge mismatch.';
    END IF;
  ELSE
    NEW.decided_at:=v_now;
    IF NOT EXISTS (SELECT 1 FROM public.locations l JOIN public.organizations o ON o.id=l.organization_id
      WHERE o.id=NEW.organization_id AND l.id=NEW.location_id
        AND o.shift_presence_revision=NEW.company_policy_revision
        AND l.shift_presence_revision=NEW.location_policy_revision
        AND NEW.applied_mode=CASE WHEN NEW.action='START'
          THEN coalesce(l.shift_start_presence_mode_override,o.shift_start_presence_mode)
          ELSE coalesce(l.shift_end_presence_mode_override,o.shift_end_presence_mode) END) THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence decision policy revision mismatch.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.shift_presence_challenges c
      JOIN public.shift_presence_operations o ON o.id=c.operation_row_id
      WHERE (c.organization_id,c.location_id,c.user_id,c.membership_id,c.action,c.id)
        =(NEW.organization_id,NEW.location_id,NEW.user_id,NEW.membership_id,NEW.action,NEW.challenge_id)
        AND (NEW.action='START' OR c.shift_id=NEW.shift_id)
        AND o.operation_id=NEW.operation_id AND o.request_fingerprint=NEW.request_fingerprint
        AND o.status='PENDING' AND c.consumed_at IS NULL AND c.expires_at>v_now) THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence decision challenge mismatch.';
    END IF;
    IF NEW.zone_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.shift_presence_zones z
      WHERE (z.organization_id,z.location_id,z.id,z.revision)=(NEW.organization_id,NEW.location_id,NEW.zone_id,NEW.zone_revision)
        AND z.state='ACTIVE') THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence decision zone revision mismatch.';
    END IF;
    IF NEW.exception_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.shift_presence_exceptions e
      WHERE (e.organization_id,e.location_id,e.user_id,e.membership_id,e.action,e.id)
        =(NEW.organization_id,NEW.location_id,NEW.user_id,NEW.membership_id,NEW.action,NEW.exception_id)
        AND e.challenge_id=NEW.challenge_id AND (NEW.action='START' OR e.shift_id=NEW.shift_id)
        AND e.status='APPROVED' AND e.expires_at>v_now) THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence decision exception mismatch.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER shift_presence_zones_insert BEFORE INSERT ON public.shift_presence_zones
  FOR EACH ROW EXECUTE FUNCTION public.shift_presence_guard_linkage();
CREATE TRIGGER shift_presence_operations_insert BEFORE INSERT ON public.shift_presence_operations
  FOR EACH ROW EXECUTE FUNCTION public.shift_presence_guard_linkage();
CREATE TRIGGER shift_presence_challenges_insert BEFORE INSERT ON public.shift_presence_challenges
  FOR EACH ROW EXECUTE FUNCTION public.shift_presence_guard_linkage();
CREATE TRIGGER shift_presence_exceptions_insert BEFORE INSERT ON public.shift_presence_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.shift_presence_guard_linkage();
CREATE TRIGGER shift_presence_decisions_insert BEFORE INSERT ON public.shift_presence_decisions
  FOR EACH ROW EXECUTE FUNCTION public.shift_presence_guard_linkage();
CREATE TRIGGER shift_presence_zones_guard BEFORE UPDATE OR DELETE ON public.shift_presence_zones
  FOR EACH ROW EXECUTE FUNCTION public.shift_presence_guard_history();
CREATE TRIGGER shift_presence_operations_guard BEFORE UPDATE OR DELETE ON public.shift_presence_operations
  FOR EACH ROW EXECUTE FUNCTION public.shift_presence_guard_history();
CREATE TRIGGER shift_presence_challenges_guard BEFORE UPDATE OR DELETE ON public.shift_presence_challenges
  FOR EACH ROW EXECUTE FUNCTION public.shift_presence_guard_history();
CREATE TRIGGER shift_presence_decisions_guard BEFORE UPDATE OR DELETE ON public.shift_presence_decisions
  FOR EACH ROW EXECUTE FUNCTION public.shift_presence_guard_history();
CREATE TRIGGER shift_presence_exceptions_guard BEFORE UPDATE OR DELETE ON public.shift_presence_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.shift_presence_guard_history();
REVOKE ALL ON TABLE public.shift_presence_zones,public.shift_presence_operations,
  public.shift_presence_challenges,public.shift_presence_decisions,public.shift_presence_exceptions FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shift_presence_guard_policy(),public.shift_presence_guard_history(),public.shift_presence_guard_linkage() FROM PUBLIC;
