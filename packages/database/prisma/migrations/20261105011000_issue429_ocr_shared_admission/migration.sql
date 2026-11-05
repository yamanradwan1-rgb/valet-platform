-- Issue #429: production OCR remains OFF. Every committed admission spends one
-- integer unit regardless of downstream outcome. This is not vendor billing.
BEGIN;

CREATE TYPE public.ocr_attempt_state AS ENUM
  ('SEND_POSSIBLE','UNKNOWN','COMPLETED','NOT_SENT','RECONCILED');
CREATE TYPE public.ocr_control_action AS ENUM
  ('PROVISION_PERIOD','ALLOCATE_ORG','SET_PLATFORM','SET_ORG',
   'ACTIVATE_PERIOD','RECONCILE_ATTEMPT');
CREATE TYPE public.ocr_control_scope AS ENUM
  ('PLATFORM','ORGANIZATION','PERIOD','ALLOCATION','ATTEMPT');

CREATE TABLE public.ocr_budget_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_alias TEXT NOT NULL CHECK
    (account_alias ~ '^[a-z][a-z0-9_-]{0,63}$'),
  starts_at TIMESTAMPTZ(3) NOT NULL,
  ends_at TIMESTAMPTZ(3) NOT NULL,
  quota_units BIGINT NOT NULL CHECK (quota_units >= 0),
  spent_units BIGINT NOT NULL DEFAULT 0 CHECK (spent_units >= 0),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ocr_period_positive_window CHECK (starts_at < ends_at),
  CONSTRAINT ocr_budget_periods_id_account_key UNIQUE (id, account_alias),
  CONSTRAINT ocr_budget_periods_account_start_key UNIQUE (account_alias, starts_at)
);

CREATE TABLE public.ocr_platform_control (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  account_alias TEXT CHECK
    (account_alias ~ '^[a-z][a-z0-9_-]{0,63}$'),
  active_period_id UUID,
  concurrency_cap INTEGER NOT NULL DEFAULT 0
    CHECK (concurrency_cap BETWEEN 0 AND 10000),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  clock_floor TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ocr_platform_active_period_consistency CHECK
    (active_period_id IS NULL OR account_alias IS NOT NULL),
  CONSTRAINT ocr_platform_enabled_requires_configuration CHECK
    (NOT enabled OR (active_period_id IS NOT NULL AND concurrency_cap > 0)),
  CONSTRAINT ocr_platform_active_period_fkey FOREIGN KEY
    (active_period_id, account_alias)
    REFERENCES public.ocr_budget_periods(id, account_alias)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);
INSERT INTO public.ocr_platform_control(id) VALUES (1);

CREATE TABLE public.ocr_organization_control (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  concurrency_cap INTEGER NOT NULL DEFAULT 0
    CHECK (concurrency_cap BETWEEN 0 AND 10000),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ocr_org_enabled_requires_capacity CHECK
    (NOT enabled OR concurrency_cap > 0)
);

CREATE TABLE public.ocr_organization_allocations (
  period_id UUID NOT NULL REFERENCES public.ocr_budget_periods(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  organization_id UUID NOT NULL REFERENCES public.organizations(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  quota_units BIGINT NOT NULL CHECK (quota_units >= 0),
  spent_units BIGINT NOT NULL DEFAULT 0 CHECK (spent_units >= 0),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ocr_organization_allocations_pkey PRIMARY KEY (period_id, organization_id)
);
CREATE INDEX ocr_allocations_org_period_idx
  ON public.ocr_organization_allocations(organization_id, period_id);

CREATE TABLE public.ocr_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  membership_id UUID NOT NULL,
  location_id UUID NOT NULL,
  staff_session_id UUID NOT NULL REFERENCES public.staff_auth_sessions(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  period_id UUID NOT NULL,
  account_alias TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 1 CHECK (units = 1),
  state public.ocr_attempt_state NOT NULL DEFAULT 'SEND_POSSIBLE',
  owner_nonce UUID NOT NULL DEFAULT gen_random_uuid(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  admitted_at TIMESTAMPTZ(3) NOT NULL,
  execution_deadline TIMESTAMPTZ(3) NOT NULL,
  first_unknown_at TIMESTAMPTZ(3),
  settled_at TIMESTAMPTZ(3),
  observation_class TEXT CHECK (observation_class IN
    ('NOT_INVOKED','HTTP_COMPLETE','UNCERTAIN','OPERATOR_PROOF')),
  http_class TEXT CHECK (http_class IN ('NONE','2XX','4XX','5XX')),
  failure_class TEXT CHECK (failure_class IN
    ('NONE','TIMEOUT','NETWORK','PROVIDER','PARSE','CANCELLED','OTHER')),
  duration_ms INTEGER CHECK (duration_ms BETWEEN 0 AND 120000),
  CONSTRAINT ocr_attempts_membership_scope_fkey FOREIGN KEY
    (organization_id, membership_id)
    REFERENCES public.organization_memberships(organization_id, id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ocr_attempts_location_scope_fkey FOREIGN KEY
    (organization_id, location_id)
    REFERENCES public.locations(organization_id, id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ocr_attempts_period_account_fkey FOREIGN KEY
    (period_id, account_alias)
    REFERENCES public.ocr_budget_periods(id, account_alias)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ocr_attempts_allocation_fkey FOREIGN KEY
    (period_id, organization_id)
    REFERENCES public.ocr_organization_allocations(period_id, organization_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ocr_attempts_time_check CHECK
    (execution_deadline > admitted_at
     AND (first_unknown_at IS NULL OR first_unknown_at >= admitted_at)
     AND (settled_at IS NULL OR settled_at >= admitted_at)),
  CONSTRAINT ocr_attempts_state_time_check CHECK
    ((state = 'SEND_POSSIBLE' AND first_unknown_at IS NULL AND settled_at IS NULL)
     OR (state = 'UNKNOWN' AND first_unknown_at IS NOT NULL AND settled_at IS NULL)
     OR (state IN ('COMPLETED','NOT_SENT') AND settled_at IS NOT NULL)
     OR (state = 'RECONCILED' AND first_unknown_at IS NOT NULL
         AND settled_at IS NOT NULL))
);
-- One live/uncertain identity remains occupied even across windows and periods.
CREATE UNIQUE INDEX ocr_attempts_one_outstanding_identity_idx
  ON public.ocr_attempts(organization_id, membership_id, location_id)
  WHERE state IN ('SEND_POSSIBLE','UNKNOWN');
CREATE INDEX ocr_attempts_identity_rolling_idx
  ON public.ocr_attempts
    (organization_id, membership_id, location_id, admitted_at DESC);
CREATE INDEX ocr_attempts_account_active_idx
  ON public.ocr_attempts(account_alias, state, admitted_at)
  WHERE state IN ('SEND_POSSIBLE','UNKNOWN');
CREATE INDEX ocr_attempts_org_active_idx
  ON public.ocr_attempts(organization_id, state, admitted_at)
  WHERE state IN ('SEND_POSSIBLE','UNKNOWN');
CREATE INDEX ocr_attempts_due_idx
  ON public.ocr_attempts(execution_deadline, id)
  WHERE state = 'SEND_POSSIBLE';
CREATE INDEX ocr_attempts_period_state_idx
  ON public.ocr_attempts(period_id, state);
CREATE INDEX ocr_attempts_org_recent_idx
  ON public.ocr_attempts(organization_id, admitted_at);

CREATE TABLE public.ocr_control_history (
  operation_id UUID PRIMARY KEY,
  actor_login TEXT NOT NULL CHECK
    (actor_login ~ '^[a-z_][a-z0-9_]{0,62}$'),
  action public.ocr_control_action NOT NULL,
  scope public.ocr_control_scope NOT NULL,
  organization_id UUID REFERENCES public.organizations(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  period_id UUID REFERENCES public.ocr_budget_periods(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  attempt_id UUID REFERENCES public.ocr_attempts(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  expected_revision BIGINT NOT NULL CHECK (expected_revision >= 0),
  applied_revision BIGINT NOT NULL CHECK (applied_revision > 0),
  old_enabled BOOLEAN,
  new_enabled BOOLEAN,
  old_cap INTEGER CHECK (old_cap BETWEEN 0 AND 10000),
  new_cap INTEGER CHECK (new_cap BETWEEN 0 AND 10000),
  old_quota_units BIGINT CHECK (old_quota_units >= 0),
  new_quota_units BIGINT CHECK (new_quota_units >= 0),
  old_active_period_id UUID,
  new_active_period_id UUID,
  old_account_alias TEXT CHECK
    (old_account_alias ~ '^[a-z][a-z0-9_-]{0,63}$'),
  new_account_alias TEXT CHECK
    (new_account_alias ~ '^[a-z][a-z0-9_-]{0,63}$'),
  account_alias TEXT CHECK (account_alias ~ '^[a-z][a-z0-9_-]{0,63}$'),
  starts_at TIMESTAMPTZ(3),
  ends_at TIMESTAMPTZ(3),
  old_attempt_state public.ocr_attempt_state,
  new_attempt_state public.ocr_attempt_state,
  proof_code TEXT CHECK
    (proof_code IN ('REMOTE_COMPLETED_FENCED','REMOTE_NOT_SENT_FENCED')),
  reason_code TEXT NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  evidence_ref TEXT CHECK (evidence_ref ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),
  occurred_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ocr_history_period_window_check CHECK
    ((starts_at IS NULL AND ends_at IS NULL)
      OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND starts_at < ends_at))
);
CREATE INDEX ocr_control_history_occurred_idx
  ON public.ocr_control_history(occurred_at, operation_id);

-- Protect non-negotiable source and cost facts even for accidental owner UPDATE.
CREATE FUNCTION public.ocr_budget_row_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'OCR budget history is immutable' USING ERRCODE='42501';
  END IF;
  IF TG_TABLE_NAME = 'ocr_budget_periods' THEN
    IF ROW(NEW.id,NEW.account_alias,NEW.starts_at,NEW.ends_at,NEW.created_at)
       IS DISTINCT FROM
       ROW(OLD.id,OLD.account_alias,OLD.starts_at,OLD.ends_at,OLD.created_at) THEN
      RAISE EXCEPTION 'OCR billing period identity is immutable' USING ERRCODE='23514';
    END IF;
  ELSE
    IF ROW(NEW.period_id,NEW.organization_id)
       IS DISTINCT FROM ROW(OLD.period_id,OLD.organization_id) THEN
      RAISE EXCEPTION 'OCR allocation scope is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.spent_units < OLD.spent_units OR NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'OCR debit/revision cannot decrease or skip' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ocr_budget_period_row_guard BEFORE UPDATE OR DELETE
  ON public.ocr_budget_periods FOR EACH ROW
  EXECUTE FUNCTION public.ocr_budget_row_guard();
CREATE TRIGGER ocr_allocation_row_guard BEFORE UPDATE OR DELETE
  ON public.ocr_organization_allocations FOR EACH ROW
  EXECUTE FUNCTION public.ocr_budget_row_guard();

CREATE FUNCTION public.ocr_attempt_row_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'OCR admitted attempts cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF ROW(NEW.id,NEW.organization_id,NEW.membership_id,NEW.location_id,
         NEW.staff_session_id,NEW.period_id,NEW.account_alias,NEW.units,
         NEW.owner_nonce,NEW.admitted_at,NEW.execution_deadline)
     IS DISTINCT FROM
     ROW(OLD.id,OLD.organization_id,OLD.membership_id,OLD.location_id,
         OLD.staff_session_id,OLD.period_id,OLD.account_alias,OLD.units,
         OLD.owner_nonce,OLD.admitted_at,OLD.execution_deadline) OR
     NEW.revision <> OLD.revision + 1 OR
     (OLD.first_unknown_at IS NOT NULL AND
      NEW.first_unknown_at IS DISTINCT FROM OLD.first_unknown_at) OR
     (OLD.settled_at IS NOT NULL AND
      NEW.settled_at IS DISTINCT FROM OLD.settled_at) THEN
    RAISE EXCEPTION 'OCR attempt source facts/revision are immutable'
      USING ERRCODE='23514';
  END IF;
  IF NOT (
    (OLD.state='SEND_POSSIBLE' AND NEW.state IN
      ('UNKNOWN','COMPLETED','NOT_SENT'))
    OR (OLD.state='UNKNOWN' AND NEW.state='RECONCILED')
  ) THEN
    RAISE EXCEPTION 'OCR attempt state transition is invalid' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ocr_attempt_row_guard BEFORE UPDATE OR DELETE
  ON public.ocr_attempts FOR EACH ROW
  EXECUTE FUNCTION public.ocr_attempt_row_guard();

CREATE FUNCTION public.ocr_control_history_append_only()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'OCR control history is append-only' USING ERRCODE='42501';
END;
$$;
CREATE TRIGGER ocr_control_history_guard BEFORE UPDATE OR DELETE
  ON public.ocr_control_history FOR EACH ROW
  EXECUTE FUNCTION public.ocr_control_history_append_only();

REVOKE ALL ON TABLE public.ocr_platform_control,
  public.ocr_organization_control, public.ocr_budget_periods,
  public.ocr_organization_allocations, public.ocr_attempts,
  public.ocr_control_history FROM PUBLIC;

-- One call inside the caller's transaction A: the caller already holds exact
-- token/session, tenant policy, lifecycle and Shift locks. Defense-in-depth
-- independently proves the persisted association and current statuses.
CREATE FUNCTION public.ocr_admit(
  p_session_id UUID, p_membership_id UUID, p_location_id UUID,
  p_timeout_ms INTEGER
)
RETURNS TABLE(
  decision TEXT, attempt_id UUID, organization_id UUID, membership_id UUID,
  location_id UUID, period_id UUID, account_alias TEXT, owner_nonce UUID,
  revision BIGINT, admitted_at TIMESTAMPTZ, execution_deadline TIMESTAMPTZ,
  remaining_authorized_ms INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_scope RECORD;
  v_platform public.ocr_platform_control%ROWTYPE;
  v_org public.ocr_organization_control%ROWTYPE;
  v_period public.ocr_budget_periods%ROWTYPE;
  v_allocation public.ocr_organization_allocations%ROWTYPE;
  v_now TIMESTAMPTZ;
  v_bound TIMESTAMPTZ;
  v_count INTEGER;
  v_id UUID;
  v_nonce UUID;
  v_ms NUMERIC;
BEGIN
  remaining_authorized_ms := 0;
  IF p_session_id IS NULL OR p_membership_id IS NULL OR
     p_location_id IS NULL OR p_timeout_ms IS NULL OR
     p_timeout_ms NOT BETWEEN 100 AND 10000 OR
     current_setting('transaction_isolation') <> 'read committed' THEN
    decision := 'STALE_AUTH';
    RETURN NEXT; RETURN;
  END IF;

  SELECT member.organization_id AS org_id,
         session.access_expires_at AS access_end,
         session.absolute_expires_at AS absolute_end
    INTO v_scope
    FROM public.staff_auth_sessions AS session
    JOIN public.users AS staff ON staff.id=session.user_id
    JOIN public.organization_memberships AS member
      ON member.user_id=staff.id AND member.id=p_membership_id
    JOIN public.organizations AS organization
      ON organization.id=member.organization_id
    JOIN public.locations AS location
      ON location.id=p_location_id AND
         location.organization_id=organization.id
    JOIN public.membership_location_access AS grant_row
      ON grant_row.organization_id=organization.id
     AND grant_row.membership_id=member.id
     AND grant_row.location_id=location.id
    JOIN public.shifts AS shift
      ON shift.organization_id=organization.id
     AND shift.membership_id=member.id
     AND shift.location_id=location.id
     AND shift.status='ACTIVE'
    WHERE session.id=p_session_id
      AND session.revoked_at IS NULL
      AND clock_timestamp()<session.access_expires_at
      AND clock_timestamp()<session.absolute_expires_at
      AND staff.status='ACTIVE'
      AND member.status='ACTIVE'
      AND member.role IN ('VALET_EMPLOYEE','VALET_SUPERVISOR')
      AND organization.status='ACTIVE' AND location.status='ACTIVE'
      AND location.accepting_intake
      AND COALESCE(location.ocr_assist_enabled_override,
                   organization.ocr_assist_enabled)
    FOR SHARE OF session,staff,member,organization,location,grant_row,shift;
  IF NOT FOUND THEN
    decision := 'STALE_AUTH';
    RETURN NEXT; RETURN;
  END IF;

  -- NOWAIT is deliberate: the API maps 55P03 specifically to LOCK_BUSY.
  -- All SQL after acquiring the platform lock uses fresh DB time.
  SELECT * INTO v_platform FROM public.ocr_platform_control AS platform
    WHERE platform.id=1 FOR UPDATE NOWAIT;
  IF NOT FOUND OR NOT v_platform.enabled OR
     v_platform.active_period_id IS NULL OR
     v_platform.account_alias IS NULL OR v_platform.concurrency_cap<=0 THEN
    decision := 'DISABLED';
    RETURN NEXT; RETURN;
  END IF;

  SELECT * INTO v_org FROM public.ocr_organization_control AS org_control
    WHERE org_control.organization_id=v_scope.org_id FOR UPDATE NOWAIT;
  IF NOT FOUND OR NOT v_org.enabled OR v_org.concurrency_cap<=0 THEN
    decision := 'DISABLED';
    RETURN NEXT; RETURN;
  END IF;
  SELECT * INTO v_period FROM public.ocr_budget_periods AS period
    WHERE period.id=v_platform.active_period_id
      AND period.account_alias=v_platform.account_alias
    FOR UPDATE NOWAIT;
  IF NOT FOUND THEN
    decision := 'NO_PERIOD';
    RETURN NEXT; RETURN;
  END IF;
  SELECT * INTO v_allocation FROM public.ocr_organization_allocations AS allocation
    WHERE allocation.period_id=v_period.id
      AND allocation.organization_id=v_scope.org_id
    FOR UPDATE NOWAIT;
  IF NOT FOUND THEN
    decision := 'NO_PERIOD';
    RETURN NEXT; RETURN;
  END IF;

  v_now := clock_timestamp();
  IF v_now < v_platform.clock_floor THEN
    decision := 'CLOCK_UNSAFE';
    RETURN NEXT; RETURN;
  END IF;
  IF v_now >= v_scope.access_end OR v_now >= v_scope.absolute_end THEN
    decision := 'STALE_AUTH';
    RETURN NEXT; RETURN;
  END IF;
  IF v_now < v_period.starts_at OR v_now >= v_period.ends_at THEN
    decision := 'NO_PERIOD';
    RETURN NEXT; RETURN;
  END IF;
  IF v_period.spent_units >= v_period.quota_units OR
     v_allocation.spent_units >= v_allocation.quota_units THEN
    decision := 'QUOTA';
    RETURN NEXT; RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ocr_attempts AS a
    WHERE a.organization_id=v_scope.org_id
      AND a.membership_id=p_membership_id
      AND a.location_id=p_location_id
      AND a.state IN ('SEND_POSSIBLE','UNKNOWN')
  ) THEN
    decision := 'CONCURRENCY';
    RETURN NEXT; RETURN;
  END IF;

  SELECT COUNT(*) INTO v_count FROM (
    SELECT 1 FROM public.ocr_attempts AS a
    WHERE a.organization_id=v_scope.org_id
      AND a.membership_id=p_membership_id
      AND a.location_id=p_location_id
      AND a.admitted_at>v_now - INTERVAL '10 seconds'
    ORDER BY a.admitted_at DESC LIMIT 5
  ) AS recent;
  IF v_count>=5 THEN
    decision := 'RATE';
    RETURN NEXT; RETURN;
  END IF;
  SELECT COUNT(*) INTO v_count FROM (
    SELECT 1 FROM public.ocr_attempts AS a
    WHERE a.organization_id=v_scope.org_id
      AND a.membership_id=p_membership_id
      AND a.location_id=p_location_id
      AND a.admitted_at>v_now - INTERVAL '60 seconds'
    ORDER BY a.admitted_at DESC LIMIT 20
  ) AS recent;
  IF v_count>=20 THEN
    decision := 'RATE';
    RETURN NEXT; RETURN;
  END IF;
  SELECT COUNT(*) INTO v_count FROM (
    SELECT 1 FROM public.ocr_attempts AS a
      WHERE a.state IN ('SEND_POSSIBLE','UNKNOWN')
      LIMIT 10000
  ) AS active;
  IF v_count>=v_platform.concurrency_cap THEN
    decision := 'LIMITED';
    RETURN NEXT; RETURN;
  END IF;
  SELECT COUNT(*) INTO v_count FROM (
    SELECT 1 FROM public.ocr_attempts AS a
      WHERE a.organization_id=v_scope.org_id
        AND a.state IN ('SEND_POSSIBLE','UNKNOWN')
      LIMIT 10000
  ) AS active;
  IF v_count>=v_org.concurrency_cap THEN
    decision := 'LIMITED';
    RETURN NEXT; RETURN;
  END IF;

  -- Clock time can advance during statement/probe work even with authorization
  -- rows still locked. Recheck every time-bound source immediately before the
  -- first debit/attempt mutation; stale sessions must never consume a permit.
  v_now:=clock_timestamp();
  IF v_now >= v_scope.access_end OR v_now >= v_scope.absolute_end THEN
    decision := 'STALE_AUTH';
    RETURN NEXT; RETURN;
  END IF;
  IF v_now < v_platform.clock_floor THEN
    decision := 'CLOCK_UNSAFE';
    RETURN NEXT; RETURN;
  END IF;
  IF v_now < v_period.starts_at OR v_now >= v_period.ends_at THEN
    decision := 'NO_PERIOD';
    RETURN NEXT; RETURN;
  END IF;

  v_id:=gen_random_uuid();
  v_nonce:=gen_random_uuid();
  v_bound:=v_now+make_interval(secs=>p_timeout_ms::DOUBLE PRECISION/1000.0+2.0);
  INSERT INTO public.ocr_attempts (
    id,organization_id,membership_id,location_id,staff_session_id,
    period_id,account_alias,units,state,owner_nonce,revision,
    admitted_at,execution_deadline
  ) VALUES (
    v_id,v_scope.org_id,p_membership_id,p_location_id,p_session_id,
    v_period.id,v_period.account_alias,1,'SEND_POSSIBLE',v_nonce,1,
    v_now,v_bound
  );
  UPDATE public.ocr_budget_periods AS p SET
    spent_units=p.spent_units+1,revision=p.revision+1
    WHERE p.id=v_period.id;
  UPDATE public.ocr_organization_allocations AS a SET
    spent_units=a.spent_units+1,revision=a.revision+1,
    updated_at=v_now
    WHERE a.period_id=v_period.id AND a.organization_id=v_scope.org_id;
  UPDATE public.ocr_platform_control AS c SET
    clock_floor=v_now,updated_at=v_now WHERE c.id=1;

  -- The API further subtracts monotonic time elapsed through known COMMIT.
  -- A nonpositive result is a consumed unit but is never a send permit.
  v_ms:=floor(EXTRACT(EPOCH FROM
    (LEAST(v_scope.access_end,v_scope.absolute_end,
           v_period.ends_at,v_bound)-clock_timestamp()))*1000);
  remaining_authorized_ms:=GREATEST(0,LEAST(2147483647,v_ms))::INTEGER;
  decision:='ADMITTED';
  attempt_id:=v_id;
  organization_id:=v_scope.org_id;
  membership_id:=p_membership_id;
  location_id:=p_location_id;
  period_id:=v_period.id;
  account_alias:=v_period.account_alias;
  owner_nonce:=v_nonce;
  revision:=1;
  admitted_at:=v_now;
  execution_deadline:=v_bound;
  RETURN NEXT;
END;
$$;

-- S never modifies spend and never releases a live UNKNOWN without separately
-- verified remote/drain evidence through the restricted operator command.
CREATE FUNCTION public.ocr_settle(
  p_attempt_id UUID, p_org_id UUID, p_member_id UUID, p_location_id UUID,
  p_period_id UUID, p_account_alias TEXT, p_owner_nonce UUID,
  p_revision BIGINT, p_new_state TEXT, p_observation_class TEXT,
  p_http_class TEXT, p_failure_class TEXT, p_duration_ms INTEGER
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_old public.ocr_attempts%ROWTYPE;
DECLARE v_now TIMESTAMPTZ;
BEGIN
  IF p_attempt_id IS NULL OR p_org_id IS NULL OR p_member_id IS NULL OR
     p_location_id IS NULL OR p_period_id IS NULL OR p_account_alias IS NULL OR
     p_owner_nonce IS NULL OR p_revision IS NULL OR p_revision<1 OR
     p_new_state IS NULL OR p_observation_class IS NULL OR
     p_http_class IS NULL OR p_failure_class IS NULL OR
     p_new_state NOT IN ('UNKNOWN','NOT_SENT') OR
     p_observation_class NOT IN ('UNCERTAIN','HTTP_COMPLETE','NOT_INVOKED') OR
     (p_new_state='UNKNOWN' AND
      p_observation_class NOT IN ('UNCERTAIN','HTTP_COMPLETE')) OR
     (p_new_state='NOT_SENT' AND p_observation_class<>'NOT_INVOKED') OR
     (p_observation_class='NOT_INVOKED' AND p_http_class<>'NONE') OR
     (p_observation_class='HTTP_COMPLETE' AND p_http_class='NONE') OR
     p_http_class NOT IN ('NONE','2XX','4XX','5XX') OR
     p_failure_class NOT IN
       ('NONE','TIMEOUT','NETWORK','PROVIDER','PARSE','CANCELLED','OTHER') OR
     p_duration_ms IS NULL OR p_duration_ms NOT BETWEEN 0 AND 120000 THEN
    RETURN FALSE;
  END IF;
  SELECT * INTO v_old FROM public.ocr_attempts AS a
    WHERE a.id=p_attempt_id AND a.organization_id=p_org_id
      AND a.membership_id=p_member_id AND a.location_id=p_location_id
      AND a.period_id=p_period_id AND a.account_alias=p_account_alias
      AND a.owner_nonce=p_owner_nonce AND a.revision=p_revision
      AND a.state='SEND_POSSIBLE'
    FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  v_now:=clock_timestamp();
  UPDATE public.ocr_attempts AS a SET
    state=p_new_state::public.ocr_attempt_state,
    first_unknown_at=CASE WHEN p_new_state='UNKNOWN' THEN v_now ELSE NULL END,
    settled_at=CASE WHEN p_new_state='UNKNOWN' THEN NULL ELSE v_now END,
    observation_class=p_observation_class,http_class=p_http_class,
    failure_class=p_failure_class,duration_ms=p_duration_ms,
    revision=a.revision+1
    WHERE a.id=v_old.id AND a.revision=v_old.revision;
  RETURN FOUND;
END;
$$;

-- Maintenance is separately credentialed and never performs provider I/O.
CREATE FUNCTION public.ocr_detect_expired(p_limit INTEGER)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_count INTEGER;
DECLARE v_sweep_locked BOOLEAN;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'OCR maintenance batch invalid' USING ERRCODE='22023';
  END IF;
  -- One shared, transaction-scoped sweep across all maintenance replicas.
  -- Failure to acquire it never stalls Check-In or triggers paid retries.
  SELECT pg_try_advisory_xact_lock(429,2101) INTO v_sweep_locked;
  IF NOT v_sweep_locked THEN RETURN 0; END IF;
  WITH due AS (
    SELECT a.id FROM public.ocr_attempts AS a
    WHERE a.state='SEND_POSSIBLE'
      AND a.execution_deadline<=clock_timestamp()
    ORDER BY a.execution_deadline,a.id
    FOR UPDATE SKIP LOCKED LIMIT p_limit
  )
  UPDATE public.ocr_attempts AS a SET
    state='UNKNOWN',first_unknown_at=clock_timestamp(),
    observation_class='UNCERTAIN',http_class='NONE',
    failure_class='TIMEOUT',revision=a.revision+1
    FROM due WHERE a.id=due.id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE INDEX ocr_attempts_active_global_idx
  ON public.ocr_attempts(admitted_at)
  WHERE state IN ('SEND_POSSIBLE','UNKNOWN');

-- No request-supplied actor reference: operator identity is the authenticated
-- PostgreSQL login. The separately provisioned NOLOGIN capability role has
-- no public defaults; missing group or missing membership fails closed.
CREATE FUNCTION public.ocr_require_operator(
  p_reason TEXT, p_evidence TEXT, p_need_evidence BOOLEAN DEFAULT FALSE
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_attr RECORD;
BEGIN
  SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,
         rolbypassrls
    INTO v_attr FROM pg_roles WHERE rolname=session_user;
  IF NOT FOUND OR NOT v_attr.rolcanlogin OR v_attr.rolsuper OR
     v_attr.rolcreatedb OR v_attr.rolcreaterole OR v_attr.rolreplication OR
     v_attr.rolbypassrls OR
     COALESCE(pg_has_role(session_user::regrole,
             to_regrole('vaylet_ocr_operator'), 'MEMBER'),FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'OCR operator is unauthorized' USING ERRCODE='42501';
  END IF;
  IF p_reason IS NULL OR p_reason !~ '^[A-Z][A-Z0-9_]{0,63}$' OR
     (p_evidence IS NOT NULL AND
      p_evidence !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$') OR
     (p_need_evidence AND p_evidence IS NULL) THEN
    RAISE EXCEPTION 'OCR operator reason/evidence invalid'
      USING ERRCODE='22023';
  END IF;
  RETURN session_user::TEXT;
END;
$$;

CREATE FUNCTION public.ocr_operator_provision_period(
  p_operation_id UUID, p_account_alias TEXT, p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ, p_quota_units BIGINT,
  p_reason TEXT, p_evidence TEXT
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_actor TEXT;
DECLARE v_control public.ocr_platform_control%ROWTYPE;
DECLARE v_prior public.ocr_control_history%ROWTYPE;
DECLARE v_id UUID;
BEGIN
  v_actor:=public.ocr_require_operator(p_reason,p_evidence,FALSE);
  IF p_operation_id IS NULL OR p_account_alias IS NULL OR
     p_account_alias !~ '^[a-z][a-z0-9_-]{0,63}$' OR
     p_starts_at IS NULL OR p_ends_at IS NULL OR
     p_starts_at>=p_ends_at OR p_quota_units IS NULL OR p_quota_units<0 THEN
    RAISE EXCEPTION 'OCR period request invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_control FROM public.ocr_platform_control WHERE id=1
    FOR UPDATE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OCR platform control missing' USING ERRCODE='55000';
  END IF;
  SELECT * INTO v_prior FROM public.ocr_control_history
    WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF v_prior.action='PROVISION_PERIOD' AND v_prior.actor_login=v_actor
       AND v_prior.account_alias=p_account_alias
       AND v_prior.starts_at=p_starts_at AND v_prior.ends_at=p_ends_at
       AND v_prior.new_quota_units=p_quota_units
       AND v_prior.reason_code=p_reason
       AND v_prior.evidence_ref IS NOT DISTINCT FROM p_evidence THEN
      RETURN v_prior.period_id;
    END IF;
    RAISE EXCEPTION 'OCR operator operation identity conflict'
      USING ERRCODE='23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ocr_budget_periods AS p
             WHERE p.account_alias=p_account_alias
               AND p.starts_at<p_ends_at AND p_starts_at<p.ends_at) THEN
    RAISE EXCEPTION 'OCR provider account periods overlap'
      USING ERRCODE='23514';
  END IF;
  v_id:=gen_random_uuid();
  INSERT INTO public.ocr_budget_periods
    (id,account_alias,starts_at,ends_at,quota_units)
    VALUES(v_id,p_account_alias,p_starts_at,p_ends_at,p_quota_units);
  INSERT INTO public.ocr_control_history (
    operation_id,actor_login,action,scope,period_id,
    expected_revision,applied_revision,new_quota_units,account_alias,
    starts_at,ends_at,reason_code,evidence_ref
  ) VALUES (
    p_operation_id,v_actor,'PROVISION_PERIOD','PERIOD',v_id,
    0,1,p_quota_units,p_account_alias,p_starts_at,p_ends_at,p_reason,p_evidence
  );
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.ocr_operator_set_org(
  p_operation_id UUID, p_org_id UUID, p_expected_revision BIGINT,
  p_enabled BOOLEAN, p_concurrency_cap INTEGER,
  p_reason TEXT, p_evidence TEXT
)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_actor TEXT;
DECLARE v_platform public.ocr_platform_control%ROWTYPE;
DECLARE v_old public.ocr_organization_control%ROWTYPE;
DECLARE v_prior public.ocr_control_history%ROWTYPE;
DECLARE v_rev BIGINT;
DECLARE v_now TIMESTAMPTZ;
BEGIN
  v_actor:=public.ocr_require_operator(p_reason,p_evidence,FALSE);
  IF p_operation_id IS NULL OR p_org_id IS NULL OR
     p_expected_revision IS NULL OR p_expected_revision<0 OR
     p_enabled IS NULL OR p_concurrency_cap IS NULL OR
     p_concurrency_cap NOT BETWEEN 0 AND 10000 OR
     (p_enabled AND p_concurrency_cap=0) THEN
    RAISE EXCEPTION 'OCR Organization control invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_platform FROM public.ocr_platform_control
    WHERE id=1 FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'OCR control missing' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_prior FROM public.ocr_control_history
    WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF v_prior.action='SET_ORG' AND v_prior.actor_login=v_actor
      AND v_prior.organization_id=p_org_id
      AND v_prior.expected_revision=p_expected_revision
      AND v_prior.new_enabled=p_enabled AND v_prior.new_cap=p_concurrency_cap
      AND v_prior.reason_code=p_reason
      AND v_prior.evidence_ref IS NOT DISTINCT FROM p_evidence THEN
      RETURN v_prior.applied_revision;
    END IF;
    RAISE EXCEPTION 'OCR operator operation identity conflict'
      USING ERRCODE='23505';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_org_id) THEN
    RAISE EXCEPTION 'OCR Organization missing' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_old FROM public.ocr_organization_control
    WHERE organization_id=p_org_id FOR UPDATE NOWAIT;
  v_now:=clock_timestamp();
  IF NOT FOUND THEN
    IF p_expected_revision<>0 THEN
      RAISE EXCEPTION 'OCR Organization revision conflict' USING ERRCODE='40001';
    END IF;
    v_rev:=1;
    INSERT INTO public.ocr_organization_control
      (organization_id,enabled,concurrency_cap,revision,updated_at)
      VALUES(p_org_id,p_enabled,p_concurrency_cap,v_rev,v_now);
  ELSE
    IF v_old.revision<>p_expected_revision THEN
      RAISE EXCEPTION 'OCR Organization revision conflict' USING ERRCODE='40001';
    END IF;
    v_rev:=v_old.revision+1;
    UPDATE public.ocr_organization_control SET
      enabled=p_enabled,concurrency_cap=p_concurrency_cap,
      revision=v_rev,updated_at=v_now WHERE organization_id=p_org_id;
  END IF;
  INSERT INTO public.ocr_control_history (
    operation_id,actor_login,action,scope,organization_id,
    expected_revision,applied_revision,old_enabled,new_enabled,
    old_cap,new_cap,reason_code,evidence_ref
  ) VALUES (
    p_operation_id,v_actor,'SET_ORG','ORGANIZATION',p_org_id,
    p_expected_revision,v_rev,v_old.enabled,p_enabled,
    v_old.concurrency_cap,p_concurrency_cap,p_reason,p_evidence
  );
  RETURN v_rev;
END;
$$;

CREATE FUNCTION public.ocr_operator_allocate(
  p_operation_id UUID, p_period_id UUID, p_org_id UUID,
  p_expected_revision BIGINT, p_quota_units BIGINT,
  p_reason TEXT, p_evidence TEXT
)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_actor TEXT;
DECLARE v_platform public.ocr_platform_control%ROWTYPE;
DECLARE v_org public.ocr_organization_control%ROWTYPE;
DECLARE v_period public.ocr_budget_periods%ROWTYPE;
DECLARE v_old public.ocr_organization_allocations%ROWTYPE;
DECLARE v_prior public.ocr_control_history%ROWTYPE;
DECLARE v_rev BIGINT;
DECLARE v_now TIMESTAMPTZ;
BEGIN
  v_actor:=public.ocr_require_operator(p_reason,p_evidence,FALSE);
  IF p_operation_id IS NULL OR p_period_id IS NULL OR p_org_id IS NULL OR
     p_expected_revision IS NULL OR p_expected_revision<0 OR
     p_quota_units IS NULL OR p_quota_units<0 THEN
    RAISE EXCEPTION 'OCR allocation request invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_platform FROM public.ocr_platform_control
    WHERE id=1 FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'OCR control missing' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_prior FROM public.ocr_control_history
    WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF v_prior.action='ALLOCATE_ORG' AND v_prior.actor_login=v_actor
      AND v_prior.period_id=p_period_id
      AND v_prior.organization_id=p_org_id
      AND v_prior.expected_revision=p_expected_revision
      AND v_prior.new_quota_units=p_quota_units
      AND v_prior.reason_code=p_reason
      AND v_prior.evidence_ref IS NOT DISTINCT FROM p_evidence THEN
      RETURN v_prior.applied_revision;
    END IF;
    RAISE EXCEPTION 'OCR operator operation identity conflict'
      USING ERRCODE='23505';
  END IF;
  SELECT * INTO v_org FROM public.ocr_organization_control
    WHERE organization_id=p_org_id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OCR Organization control must be provisioned'
      USING ERRCODE='55000';
  END IF;
  SELECT * INTO v_period FROM public.ocr_budget_periods
    WHERE id=p_period_id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'OCR period missing' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_old FROM public.ocr_organization_allocations
    WHERE period_id=p_period_id AND organization_id=p_org_id
    FOR UPDATE NOWAIT;
  v_now:=clock_timestamp();
  IF NOT FOUND THEN
    IF p_expected_revision<>0 THEN
      RAISE EXCEPTION 'OCR allocation revision conflict' USING ERRCODE='40001';
    END IF;
    v_rev:=1;
    INSERT INTO public.ocr_organization_allocations
      (period_id,organization_id,quota_units,revision,updated_at)
      VALUES(p_period_id,p_org_id,p_quota_units,v_rev,v_now);
  ELSE
    IF v_old.revision<>p_expected_revision THEN
      RAISE EXCEPTION 'OCR allocation revision conflict' USING ERRCODE='40001';
    END IF;
    v_rev:=v_old.revision+1;
    UPDATE public.ocr_organization_allocations SET
      quota_units=p_quota_units,revision=v_rev,updated_at=v_now
      WHERE period_id=p_period_id AND organization_id=p_org_id;
  END IF;
  INSERT INTO public.ocr_control_history (
    operation_id,actor_login,action,scope,organization_id,period_id,
    expected_revision,applied_revision,old_quota_units,new_quota_units,
    account_alias,reason_code,evidence_ref
  ) VALUES (
    p_operation_id,v_actor,'ALLOCATE_ORG','ALLOCATION',p_org_id,p_period_id,
    p_expected_revision,v_rev,v_old.quota_units,p_quota_units,
    v_period.account_alias,p_reason,p_evidence
  );
  RETURN v_rev;
END;
$$;

CREATE FUNCTION public.ocr_operator_set_platform(
  p_operation_id UUID, p_expected_revision BIGINT, p_enabled BOOLEAN,
  p_account_alias TEXT, p_concurrency_cap INTEGER,
  p_reason TEXT, p_evidence TEXT
)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_actor TEXT;
DECLARE v_old public.ocr_platform_control%ROWTYPE;
DECLARE v_prior public.ocr_control_history%ROWTYPE;
DECLARE v_new_period UUID;
DECLARE v_revision BIGINT;
DECLARE v_now TIMESTAMPTZ;
BEGIN
  v_actor:=public.ocr_require_operator(p_reason,p_evidence,FALSE);
  IF p_operation_id IS NULL OR p_expected_revision IS NULL OR
     p_expected_revision<1 OR p_enabled IS NULL OR p_concurrency_cap IS NULL OR
     p_concurrency_cap NOT BETWEEN 0 AND 10000 OR
     (p_account_alias IS NOT NULL AND
      p_account_alias !~ '^[a-z][a-z0-9_-]{0,63}$') OR
     (p_enabled AND (p_account_alias IS NULL OR p_concurrency_cap=0)) THEN
    RAISE EXCEPTION 'OCR platform control request invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_old FROM public.ocr_platform_control
    WHERE id=1 FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'OCR platform control missing' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_prior FROM public.ocr_control_history
    WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF v_prior.action='SET_PLATFORM' AND v_prior.actor_login=v_actor
       AND v_prior.expected_revision=p_expected_revision
       AND v_prior.new_enabled=p_enabled
       AND v_prior.new_cap=p_concurrency_cap
       AND v_prior.new_account_alias IS NOT DISTINCT FROM p_account_alias
       AND v_prior.reason_code=p_reason
       AND v_prior.evidence_ref IS NOT DISTINCT FROM p_evidence THEN
      RETURN v_prior.applied_revision;
    END IF;
    RAISE EXCEPTION 'OCR operator operation identity conflict'
      USING ERRCODE='23505';
  END IF;
  IF v_old.revision<>p_expected_revision THEN
    RAISE EXCEPTION 'OCR platform revision conflict' USING ERRCODE='40001';
  END IF;
  v_now:=clock_timestamp();
  IF v_now<v_old.clock_floor THEN
    RAISE EXCEPTION 'OCR authoritative clock rollback' USING ERRCODE='55000';
  END IF;
  IF v_old.account_alias IS DISTINCT FROM p_account_alias THEN
    IF v_old.enabled OR EXISTS (
      SELECT 1 FROM public.ocr_attempts AS a
       WHERE a.state IN ('SEND_POSSIBLE','UNKNOWN')
         AND (v_old.account_alias IS NULL OR a.account_alias=v_old.account_alias)
    ) THEN
      RAISE EXCEPTION 'OCR old account exposure must be fenced and resolved'
        USING ERRCODE='55000';
    END IF;
    v_new_period:=NULL;
  ELSE
    v_new_period:=v_old.active_period_id;
  END IF;
  IF p_enabled AND NOT EXISTS (
    SELECT 1 FROM public.ocr_budget_periods AS p
    WHERE p.id=v_new_period AND p.account_alias=p_account_alias
      AND v_now>=p.starts_at AND v_now<p.ends_at
  ) THEN
    RAISE EXCEPTION 'OCR active period required before enabling'
      USING ERRCODE='55000';
  END IF;
  v_revision:=v_old.revision+1;
  UPDATE public.ocr_platform_control SET
    enabled=p_enabled,account_alias=p_account_alias,
    active_period_id=v_new_period,concurrency_cap=p_concurrency_cap,
    clock_floor=v_now,updated_at=v_now,revision=v_revision WHERE id=1;
  INSERT INTO public.ocr_control_history (
    operation_id,actor_login,action,scope,
    expected_revision,applied_revision,old_enabled,new_enabled,
    old_cap,new_cap,old_account_alias,new_account_alias,
    old_active_period_id,new_active_period_id,reason_code,evidence_ref
  ) VALUES (
    p_operation_id,v_actor,'SET_PLATFORM','PLATFORM',
    p_expected_revision,v_revision,v_old.enabled,p_enabled,
    v_old.concurrency_cap,p_concurrency_cap,
    v_old.account_alias,p_account_alias,v_old.active_period_id,
    v_new_period,p_reason,p_evidence
  );
  RETURN v_revision;
END;
$$;

CREATE FUNCTION public.ocr_operator_activate_period(
  p_operation_id UUID, p_expected_platform_revision BIGINT,
  p_period_id UUID, p_reason TEXT, p_evidence TEXT
)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_actor TEXT;
DECLARE v_platform public.ocr_platform_control%ROWTYPE;
DECLARE v_period public.ocr_budget_periods%ROWTYPE;
DECLARE v_prior public.ocr_control_history%ROWTYPE;
DECLARE v_now TIMESTAMPTZ;
DECLARE v_rev BIGINT;
BEGIN
  v_actor:=public.ocr_require_operator(p_reason,p_evidence,FALSE);
  IF p_operation_id IS NULL OR p_expected_platform_revision IS NULL OR
     p_expected_platform_revision<1 OR p_period_id IS NULL THEN
    RAISE EXCEPTION 'OCR period activation request invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_platform FROM public.ocr_platform_control
    WHERE id=1 FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'OCR control missing' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_prior FROM public.ocr_control_history
    WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF v_prior.action='ACTIVATE_PERIOD' AND v_prior.actor_login=v_actor
      AND v_prior.expected_revision=p_expected_platform_revision
      AND v_prior.new_active_period_id=p_period_id
      AND v_prior.reason_code=p_reason
      AND v_prior.evidence_ref IS NOT DISTINCT FROM p_evidence THEN
      RETURN v_prior.applied_revision;
    END IF;
    RAISE EXCEPTION 'OCR operator operation identity conflict'
      USING ERRCODE='23505';
  END IF;
  IF v_platform.revision<>p_expected_platform_revision THEN
    RAISE EXCEPTION 'OCR platform revision conflict' USING ERRCODE='40001';
  END IF;
  SELECT * INTO v_period FROM public.ocr_budget_periods
    WHERE id=p_period_id FOR UPDATE NOWAIT;
  IF NOT FOUND OR v_platform.account_alias IS DISTINCT FROM v_period.account_alias THEN
    RAISE EXCEPTION 'OCR period account mismatch' USING ERRCODE='22023';
  END IF;
  v_now:=clock_timestamp();
  IF v_now<v_platform.clock_floor OR
     v_now<v_period.starts_at OR v_now>=v_period.ends_at THEN
    RAISE EXCEPTION 'OCR period not active at authoritative time'
      USING ERRCODE='55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ocr_attempts AS a
    WHERE a.account_alias=v_period.account_alias AND a.period_id<>v_period.id
      AND a.state IN ('SEND_POSSIBLE','UNKNOWN')
  ) THEN
    RAISE EXCEPTION 'OCR prior-period remote liability unresolved'
      USING ERRCODE='55000';
  END IF;
  v_rev:=v_platform.revision+1;
  UPDATE public.ocr_platform_control SET
    active_period_id=v_period.id,clock_floor=v_now,
    revision=v_rev,updated_at=v_now WHERE id=1;
  INSERT INTO public.ocr_control_history (
    operation_id,actor_login,action,scope,period_id,
    expected_revision,applied_revision,old_active_period_id,
    new_active_period_id,account_alias,reason_code,evidence_ref
  ) VALUES (
    p_operation_id,v_actor,'ACTIVATE_PERIOD','PLATFORM',v_period.id,
    p_expected_platform_revision,v_rev,v_platform.active_period_id,
    v_period.id,v_period.account_alias,p_reason,p_evidence
  );
  RETURN v_rev;
END;
$$;

CREATE FUNCTION public.ocr_operator_resolve_attempt(
  p_operation_id UUID, p_attempt_id UUID, p_organization_id UUID,
  p_expected_revision BIGINT, p_proof_code TEXT,
  p_reason TEXT, p_evidence TEXT
)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_actor TEXT;
DECLARE v_prior public.ocr_control_history%ROWTYPE;
DECLARE v_attempt public.ocr_attempts%ROWTYPE;
DECLARE v_revision BIGINT;
DECLARE v_now TIMESTAMPTZ;
BEGIN
  v_actor:=public.ocr_require_operator(p_reason,p_evidence,TRUE);
  IF p_operation_id IS NULL OR p_attempt_id IS NULL OR
     p_organization_id IS NULL OR p_expected_revision IS NULL OR
     p_expected_revision<1 OR p_proof_code IS NULL OR p_proof_code NOT IN
       ('REMOTE_COMPLETED_FENCED','REMOTE_NOT_SENT_FENCED') THEN
    RAISE EXCEPTION 'OCR recovery proof request invalid'
      USING ERRCODE='22023';
  END IF;
  -- No global control, Staff or Shift locks on the recovery path.
  SELECT * INTO v_attempt FROM public.ocr_attempts AS a
    WHERE a.id=p_attempt_id AND a.organization_id=p_organization_id
    FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'OCR attempt not found' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_prior FROM public.ocr_control_history
    WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF v_prior.action='RECONCILE_ATTEMPT' AND v_prior.actor_login=v_actor
      AND v_prior.attempt_id=p_attempt_id
      AND v_prior.organization_id=p_organization_id
      AND v_prior.expected_revision=p_expected_revision
      AND v_prior.proof_code=p_proof_code
      AND v_prior.reason_code=p_reason
      AND v_prior.evidence_ref IS NOT DISTINCT FROM p_evidence THEN
      RETURN v_prior.applied_revision;
    END IF;
    RAISE EXCEPTION 'OCR operator operation identity conflict'
      USING ERRCODE='23505';
  END IF;
  IF v_attempt.revision<>p_expected_revision OR
     v_attempt.state<>'UNKNOWN' THEN
    RAISE EXCEPTION 'OCR recovery revision/state conflict'
      USING ERRCODE='40001';
  END IF;
  v_now:=clock_timestamp();
  v_revision:=v_attempt.revision+1;
  UPDATE public.ocr_attempts SET
    state='RECONCILED',settled_at=v_now,
    observation_class='OPERATOR_PROOF',revision=v_revision
    WHERE id=v_attempt.id;
  INSERT INTO public.ocr_control_history (
    operation_id,actor_login,action,scope,organization_id,period_id,
    attempt_id,expected_revision,applied_revision,
    old_attempt_state,new_attempt_state,proof_code,
    reason_code,evidence_ref
  ) VALUES (
    p_operation_id,v_actor,'RECONCILE_ATTEMPT','ATTEMPT',
    v_attempt.organization_id,v_attempt.period_id,v_attempt.id,
    p_expected_revision,v_revision,'UNKNOWN','RECONCILED',p_proof_code,
    p_reason,p_evidence
  );
  RETURN v_revision;
END;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC on functions by default. Deny all paths
-- until verified runtime, maintenance and operator provisioning explicitly
-- grants the narrow interfaces to separately credentialed principals.
REVOKE ALL ON FUNCTION
  public.ocr_admit(uuid,uuid,uuid,integer),
  public.ocr_settle(uuid,uuid,uuid,uuid,uuid,text,uuid,bigint,text,text,text,text,integer),
  public.ocr_detect_expired(integer),
  public.ocr_require_operator(text,text,boolean),
  public.ocr_operator_provision_period(uuid,text,timestamptz,timestamptz,bigint,text,text),
  public.ocr_operator_set_org(uuid,uuid,bigint,boolean,integer,text,text),
  public.ocr_operator_allocate(uuid,uuid,uuid,bigint,bigint,text,text),
  public.ocr_operator_set_platform(uuid,bigint,boolean,text,integer,text,text),
  public.ocr_operator_activate_period(uuid,bigint,uuid,text,text),
  public.ocr_operator_resolve_attempt(uuid,uuid,uuid,bigint,text,text,text),
  public.ocr_budget_row_guard(),
  public.ocr_attempt_row_guard(),
  public.ocr_control_history_append_only()
FROM PUBLIC;

COMMIT;
