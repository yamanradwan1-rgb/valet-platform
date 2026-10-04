-- DEC-100: actual early expiry, preserved approval history and exact denied recovery.
BEGIN;
CREATE TYPE public.shift_presence_denial_reason AS ENUM
  ('APPROVER_AUTHORITY_REVOKED','PRESENCE_REQUIRED','PRESENCE_REJECTED');
CREATE TYPE public.shift_presence_expiry_cause AS ENUM ('APPROVER_AUTHORITY_REVOKED');
ALTER TABLE public.shift_presence_operations
  ADD COLUMN denial_reason public.shift_presence_denial_reason,
  ADD COLUMN request_policy_fingerprint TEXT CHECK (request_policy_fingerprint ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT shift_presence_operations_denial_check CHECK
    (denial_reason IS NULL OR status='DENIED');
ALTER TABLE public.shift_presence_exceptions
  ADD COLUMN expiry_cause public.shift_presence_expiry_cause,
  DROP CONSTRAINT shift_presence_exceptions_state_check,
  ADD CONSTRAINT shift_presence_exceptions_state_check CHECK (
    (status='PENDING' AND reviewed_at IS NULL AND terminal_at IS NULL AND consumed_decision_id IS NULL AND expiry_cause IS NULL)
    OR (status='APPROVED' AND reviewed_at IS NOT NULL AND reviewed_at<expires_at AND terminal_at IS NULL AND consumed_decision_id IS NULL AND expiry_cause IS NULL)
    OR (status='REJECTED' AND reviewed_at IS NOT NULL AND terminal_at=reviewed_at AND consumed_decision_id IS NULL AND expiry_cause IS NULL)
    OR (status='EXPIRED' AND terminal_at IS NOT NULL AND consumed_decision_id IS NULL
      AND ((expiry_cause IS NULL AND terminal_at>=expires_at)
        OR (expiry_cause='APPROVER_AUTHORITY_REVOKED' AND reviewed_at IS NOT NULL AND terminal_at>=reviewed_at)))
    OR (status='CONSUMED' AND reviewed_at IS NOT NULL AND terminal_at>=reviewed_at AND terminal_at<expires_at AND consumed_decision_id IS NOT NULL AND expiry_cause IS NULL)
  );

-- Column grants are insufficient for owner/definer writes: protect new immutable facts too.
CREATE FUNCTION public.shift_presence_guard_denial() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_TABLE_NAME='shift_presence_operations' THEN
    IF TG_OP='INSERT' AND (NEW.denial_reason IS NOT NULL OR NEW.request_policy_fingerprint IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Presence operation must begin without result facts.';
    END IF;
    IF TG_OP='UPDATE' AND (OLD.status<>'PENDING' OR
      (OLD.request_policy_fingerprint IS NOT NULL AND NEW.request_policy_fingerprint IS DISTINCT FROM OLD.request_policy_fingerprint)) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Presence result facts are immutable.';
    END IF;
    IF NEW.request_policy_fingerprint IS NOT NULL AND NEW.request_fingerprint IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Presence policy requires a bound attempt.';
    END IF;
    IF NEW.denial_reason='APPROVER_AUTHORITY_REVOKED' AND NOT EXISTS (
      SELECT 1 FROM public.shift_presence_exceptions e JOIN public.shift_presence_challenges c ON c.id=e.challenge_id
      WHERE c.operation_row_id=NEW.id AND e.status='EXPIRED' AND e.expiry_cause='APPROVER_AUTHORITY_REVOKED'
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Revocation denial requires exact early expiry provenance.';
    END IF;
  ELSE
    IF TG_OP='INSERT' AND NEW.expiry_cause IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Presence exception must begin without expiry cause.';
    END IF;
    IF TG_OP='UPDATE' AND NEW.expiry_cause IS DISTINCT FROM OLD.expiry_cause AND
      NOT (OLD.status='APPROVED' AND NEW.status='EXPIRED'
        AND OLD.expiry_cause IS NULL AND NEW.expiry_cause='APPROVER_AUTHORITY_REVOKED'
        AND current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.shift_presence_exceptions'::regclass)) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Presence early expiry requires its narrow command.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER shift_presence_operations_denial_guard BEFORE INSERT OR UPDATE ON public.shift_presence_operations
  FOR EACH ROW EXECUTE FUNCTION public.shift_presence_guard_denial();
CREATE TRIGGER shift_presence_exceptions_denial_guard BEFORE INSERT OR UPDATE ON public.shift_presence_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.shift_presence_guard_denial();

CREATE FUNCTION public.shift_presence_expire_revoked_approval(
  p_user UUID, p_operation UUID, p_exception UUID, p_audit UUID,
  p_target TEXT, p_request TEXT, p_policy TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_exception public.shift_presence_exceptions%ROWTYPE;
  v_operation public.shift_presence_operations%ROWTYPE;
  v_location public.locations%ROWTYPE;
  v_valid BOOLEAN;
BEGIN
  -- Immutable owned relationships are proven before any protected write.
  SELECT e.* INTO v_exception FROM public.shift_presence_exceptions e
    JOIN public.shift_presence_challenges c ON c.id=e.challenge_id
    JOIN public.shift_presence_operations o ON o.id=c.operation_row_id
    JOIN public.users u ON u.id=e.user_id AND u.status='ACTIVE'
    WHERE e.id=p_exception AND e.user_id=p_user AND o.user_id=p_user AND o.operation_id=p_operation
      AND (e.organization_id,e.location_id,e.membership_id,e.action)=(o.organization_id,o.location_id,o.membership_id,o.action)
      AND e.shift_id IS NOT DISTINCT FROM o.shift_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Presence target unavailable.'; END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('management-settings-org:'||v_exception.organization_id::text,0));
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('location-lifecycle:'||v_exception.location_id::text,0));
  IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('staff-management-org:'||v_exception.organization_id::text,0)) THEN
    RAISE EXCEPTION USING ERRCODE='55P03', MESSAGE='Presence authority busy.';
  END IF;
  PERFORM id FROM public.users WHERE id IN (p_user,v_exception.reviewer_user_id) FOR SHARE NOWAIT;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_user AND status='ACTIVE') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Presence target unavailable.';
  END IF;
  PERFORM id FROM public.organization_memberships
    WHERE organization_id=v_exception.organization_id AND user_id IN (p_user,v_exception.reviewer_user_id)
    ORDER BY id FOR SHARE NOWAIT;
  PERFORM a.location_id FROM public.membership_location_access a
    JOIN public.organization_memberships m ON m.id=a.membership_id AND m.organization_id=a.organization_id
    WHERE a.organization_id=v_exception.organization_id AND a.location_id=v_exception.location_id
      AND m.user_id=v_exception.reviewer_user_id FOR SHARE OF a NOWAIT;
  PERFORM id FROM public.organizations WHERE id=v_exception.organization_id FOR SHARE NOWAIT;
  SELECT * INTO v_location FROM public.locations WHERE id=v_exception.location_id FOR SHARE NOWAIT;
  PERFORM organization_id FROM public.organization_subscriptions WHERE organization_id=v_exception.organization_id FOR SHARE NOWAIT;
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.organization_memberships m ON m.user_id=u.id AND m.organization_id=v_exception.organization_id
    JOIN public.organizations o ON o.id=m.organization_id AND o.status='ACTIVE'
    JOIN public.organization_subscriptions s ON s.organization_id=o.id AND s.dashboard_access_enabled
    WHERE u.id=v_exception.reviewer_user_id AND u.status='ACTIVE' AND m.status='ACTIVE'
      AND v_location.status='ACTIVE' AND (m.role='ORG_ADMIN' OR (m.role='LOCATION_MANAGER' AND EXISTS (
        SELECT 1 FROM public.membership_location_access a WHERE a.organization_id=m.organization_id
          AND a.membership_id=m.id AND a.location_id=v_exception.location_id)))
  ) INTO v_valid;
  IF v_valid THEN RETURN FALSE; END IF;
  SELECT o.* INTO v_operation FROM public.shift_presence_operations o
    WHERE o.user_id=p_user AND o.operation_id=p_operation FOR UPDATE;
  IF v_operation.target_fingerprint IS DISTINCT FROM p_target OR
    (v_operation.request_fingerprint IS NOT NULL AND v_operation.request_fingerprint IS DISTINCT FROM p_request) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Presence operation intent conflict.';
  END IF;
  PERFORM id FROM public.shift_presence_challenges WHERE operation_row_id=v_operation.id FOR UPDATE;
  SELECT * INTO v_exception FROM public.shift_presence_exceptions WHERE id=p_exception FOR UPDATE;
  IF v_operation.status<>'PENDING' OR v_exception.status<>'APPROVED'
    OR v_exception.consumed_decision_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Presence approval no longer pending consumption.';
  END IF;
  IF clock_timestamp()>=v_operation.expires_at OR clock_timestamp()>=v_exception.expires_at OR NOT EXISTS (
    SELECT 1 FROM public.shift_presence_challenges c WHERE c.id=v_exception.challenge_id
      AND c.operation_row_id=v_operation.id AND c.consumed_at IS NULL AND clock_timestamp()<c.expires_at
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Presence approval lifetime expired.';
  END IF;
  IF v_operation.request_fingerprint IS NULL THEN
    UPDATE public.shift_presence_operations SET request_fingerprint=p_request,request_policy_fingerprint=p_policy
      WHERE id=v_operation.id;
  END IF;
  UPDATE public.shift_presence_exceptions SET status='EXPIRED', revision=revision+1,
    terminal_at=clock_timestamp(), expiry_cause='APPROVER_AUTHORITY_REVOKED' WHERE id=p_exception;
  UPDATE public.shift_presence_operations SET status='DENIED', terminal_at=clock_timestamp(),
    denial_reason='APPROVER_AUTHORITY_REVOKED' WHERE id=v_operation.id;
  INSERT INTO public.audit_events (id,organization_id,location_id,actor_membership_id,actor_type,event_type,entity_type,entity_id,metadata_json,occurred_at)
    VALUES (p_audit,v_exception.organization_id,v_exception.location_id,v_exception.membership_id,'MEMBERSHIP',
      'SHIFT_PRESENCE_APPROVAL_EXPIRED','ShiftPresenceException',p_exception,
      jsonb_build_object('reason','APPROVER_AUTHORITY_REVOKED','revision',v_exception.revision+1),clock_timestamp());
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.shift_presence_guard_denial() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shift_presence_expire_revoked_approval(UUID,UUID,UUID,UUID,TEXT,TEXT,TEXT) FROM PUBLIC;
COMMIT;
