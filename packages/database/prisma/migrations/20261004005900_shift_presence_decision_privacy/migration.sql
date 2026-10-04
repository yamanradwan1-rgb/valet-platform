-- DEC-099 owner clarification: attempt digests belong only to the 90-day Operation.
-- Preserve independent operation/challenge IDs and all remaining 24-month history.
-- Replace guards atomically with the column removal; never rewrite migration 058.
BEGIN;
ALTER TABLE public.shift_presence_decisions DROP COLUMN request_fingerprint;
CREATE OR REPLACE FUNCTION public.shift_presence_guard_history() RETURNS TRIGGER
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
        AND NEW.request_fingerprint IS NOT NULL
        AND (d.organization_id,d.location_id,d.user_id,d.membership_id,d.action)
          =(NEW.organization_id,NEW.location_id,NEW.user_id,NEW.membership_id,NEW.action)
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
CREATE OR REPLACE FUNCTION public.shift_presence_guard_linkage() RETURNS TRIGGER
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
        AND o.operation_id=NEW.operation_id AND o.request_fingerprint IS NOT NULL
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

REVOKE ALL ON FUNCTION public.shift_presence_guard_history(),public.shift_presence_guard_linkage() FROM PUBLIC;
COMMIT;
