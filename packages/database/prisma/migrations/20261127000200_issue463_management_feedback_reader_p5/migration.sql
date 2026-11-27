-- Issue #463 P5: forward-only, dormant, protected credential-bound SQL reader.
-- W5-authored reader body integrated by sole migration owner W2.
-- No ordinary runtime, operator or nested staff-lock EXECUTE granted here.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $w2_p5$
BEGIN
  IF current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r
          WHERE r.rolname=current_user AND r.rolcreaterole
            AND NOT r.rolsuper AND NOT r.rolinherit)
     OR (SELECT d.datdba::regrole::text FROM pg_catalog.pg_database d
          WHERE d.datname=current_database()) <> current_user
     OR (SELECT count(*) FROM pg_catalog.pg_proc p
         JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
         WHERE r.rolname='vaylet_rating_feedback_reader_owner') <> 1
     OR (SELECT count(*) FROM pg_catalog.pg_proc p
         JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
         WHERE r.rolname='vaylet_rating_feedback_privacy_owner') <> 5
     OR (SELECT p.proowner::regrole::text
           FROM pg_catalog.pg_proc p
          WHERE p.oid='public.rating_feedback_is_protected()'::regprocedure)
          <> 'vaylet_rating_feedback_reader_owner'
  THEN
    RAISE EXCEPTION 'ISSUE463_P5_PREREQUISITE_OWNER_INVENTORY_INVALID';
  END IF;
END;
$w2_p5$;
SET LOCAL ROLE vap1_proof_owner;
DO $w2_boundary$
DECLARE v_phase text;
BEGIN
  SELECT phase INTO v_phase
  FROM auth_proof_private.option_c_launch_boundary
  WHERE singleton FOR UPDATE;
  IF NOT FOUND OR v_phase NOT IN ('LEGACY','PROTECTED') THEN
    RAISE EXCEPTION 'ISSUE463_P5_OPTION_C_BOUNDARY_INVALID';
  END IF;
END;
$w2_boundary$;
RESET ROLE;

-- Narrow FOR SHARE column privileges: constant guard UPDATE permits locking,
-- not ordinary business mutation; no table-level DML for the F owner.
ALTER TABLE public.organizations ADD COLUMN rating_feedback_lock_guard
  BIGINT NOT NULL DEFAULT 0 CHECK(rating_feedback_lock_guard=0);
ALTER TABLE public.organization_memberships ADD COLUMN rating_feedback_lock_guard
  BIGINT NOT NULL DEFAULT 0 CHECK(rating_feedback_lock_guard=0);
ALTER TABLE public.organization_subscriptions ADD COLUMN rating_feedback_lock_guard
  BIGINT NOT NULL DEFAULT 0 CHECK(rating_feedback_lock_guard=0);
ALTER TABLE public.locations ADD COLUMN rating_feedback_lock_guard
  BIGINT NOT NULL DEFAULT 0 CHECK(rating_feedback_lock_guard=0);
ALTER TABLE public.membership_location_access ADD COLUMN rating_feedback_lock_guard
  BIGINT NOT NULL DEFAULT 0 CHECK(rating_feedback_lock_guard=0);
ALTER TABLE public.user_mfa_totp_factors ADD COLUMN rating_feedback_lock_guard
  BIGINT NOT NULL DEFAULT 0 CHECK(rating_feedback_lock_guard=0);

GRANT SELECT(id,status),UPDATE(rating_feedback_lock_guard)
 ON public.organizations TO vaylet_rating_feedback_reader_owner;
GRANT SELECT(id,organization_id,user_id,role,status),UPDATE(rating_feedback_lock_guard)
 ON public.organization_memberships TO vaylet_rating_feedback_reader_owner;
GRANT SELECT(organization_id,dashboard_access_enabled),UPDATE(rating_feedback_lock_guard)
 ON public.organization_subscriptions TO vaylet_rating_feedback_reader_owner;
GRANT SELECT(id,organization_id,status,name,timezone),UPDATE(rating_feedback_lock_guard)
 ON public.locations TO vaylet_rating_feedback_reader_owner;
GRANT SELECT(organization_id,membership_id,location_id),UPDATE(rating_feedback_lock_guard)
 ON public.membership_location_access TO vaylet_rating_feedback_reader_owner;
GRANT SELECT(id,user_id,state),UPDATE(rating_feedback_lock_guard)
 ON public.user_mfa_totp_factors TO vaylet_rating_feedback_reader_owner;
GRANT SELECT(id,organization_id,location_id,state,completed_at)
 ON public.valet_sessions TO vaylet_rating_feedback_reader_owner;
GRANT SELECT(organization_id,location_id,valet_session_id,rating,rated_at)
 ON public.guest_ratings TO vaylet_rating_feedback_reader_owner;

-- Temporary CREATE available to F only within this boundary-locked migration.
GRANT CREATE ON SCHEMA public TO vaylet_rating_feedback_reader_owner;
SET LOCAL ROLE vaylet_rating_feedback_reader_owner;
CREATE FUNCTION public.management_rating_feedback_projection(
  p_session_id uuid, p_user_id uuid, p_bearer text,
  p_created_at timestamptz, p_membership_id uuid, p_organization_id uuid,
  p_location_id uuid, p_from date, p_to date
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $reader$
DECLARE
  v_session record;
  v_member record;
  v_location uuid;
  v_factor uuid;
  v_now timestamptz;
  v_projection jsonb;
  v_internal jsonb;
BEGIN
  IF NOT public.rating_feedback_is_protected()
     OR pg_catalog.current_setting('transaction_isolation') <> 'read committed'
     OR p_session_id IS NULL OR p_user_id IS NULL OR p_bearer IS NULL
     OR p_created_at IS NULL OR p_membership_id IS NULL
     OR p_organization_id IS NULL OR p_from IS NULL OR p_to IS NULL
     OR p_from > p_to OR p_to - p_from >= 31 THEN
    RAISE EXCEPTION 'Protected rating feedback unavailable' USING ERRCODE='42501';
  END IF;
  -- Direct SQL callers receive the same bounded lock wait as the HTTP opt-in.
  PERFORM pg_catalog.set_config(
    'lock_timeout',
    CASE WHEN pg_catalog.current_setting('lock_timeout')::interval = interval '0'
      THEN '2000ms'
      ELSE (LEAST(
        EXTRACT(epoch FROM pg_catalog.current_setting('lock_timeout')::interval) * 1000,
        2000
      )::bigint)::text || 'ms'
    END, true
  );
  SELECT * INTO v_session FROM public.staff_auth_lock_current_session(
    p_session_id, p_user_id, p_bearer, p_created_at, 'SHARED'
  );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Protected rating feedback unavailable' USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('staff-management-org:' || p_organization_id::text, 0)
  );

  -- All six authority rows take distinct FOR SHARE NOWAIT locks in a fixed order.
  SELECT m.id, m.role::text AS role, m.status::text AS status
    INTO v_member
  FROM public.organization_memberships AS m
  WHERE m.id=p_membership_id AND m.user_id=p_user_id
    AND m.organization_id=p_organization_id
  FOR SHARE OF m NOWAIT;
  IF NOT FOUND OR v_member.status <> 'ACTIVE'
     OR v_member.role NOT IN ('ORG_ADMIN','LOCATION_MANAGER')
     OR (v_member.role='LOCATION_MANAGER' AND p_location_id IS NULL) THEN
    RAISE EXCEPTION 'Protected rating feedback unavailable' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.organizations AS o
    WHERE o.id=p_organization_id AND o.status='ACTIVE'
    FOR SHARE OF o NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Protected rating feedback unavailable' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.organization_subscriptions AS s
    WHERE s.organization_id=p_organization_id AND s.dashboard_access_enabled=true
    FOR SHARE OF s NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Protected rating feedback unavailable' USING ERRCODE='42501';
  END IF;
  IF p_location_id IS NOT NULL THEN
    SELECT l.id INTO v_location FROM public.locations AS l
      WHERE l.id=p_location_id AND l.organization_id=p_organization_id
        AND l.status='ACTIVE'
      FOR SHARE OF l NOWAIT;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Protected rating feedback unavailable' USING ERRCODE='42501';
    END IF;
  END IF;
  IF v_member.role='LOCATION_MANAGER' THEN
    PERFORM 1 FROM public.membership_location_access AS a
      WHERE a.organization_id=p_organization_id AND a.membership_id=p_membership_id
        AND a.location_id=p_location_id
      FOR SHARE OF a NOWAIT;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Protected rating feedback unavailable' USING ERRCODE='42501';
    END IF;
  END IF;
  IF v_member.role='ORG_ADMIN' THEN
    SELECT f.id INTO v_factor FROM public.user_mfa_totp_factors AS f
      WHERE f.id=v_session.mfa_factor_id AND f.user_id=p_user_id
        AND f.state='ACTIVE'
      FOR SHARE OF f NOWAIT;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Protected rating feedback unavailable' USING ERRCODE='42501';
    END IF;
  END IF;
  SELECT * INTO v_session FROM public.staff_auth_lock_current_session(
    p_session_id, p_user_id, p_bearer, p_created_at, 'SHARED'
  );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Protected rating feedback unavailable' USING ERRCODE='42501';
  END IF;
  v_now := pg_catalog.clock_timestamp();
  IF v_member.role='ORG_ADMIN' AND (
     v_session.mfa_factor_id IS DISTINCT FROM v_factor
     OR v_session.mfa_authenticated_at IS NULL
     OR v_session.last_admin_activity_at IS NULL
     OR v_session.mfa_authenticated_at > v_now
     OR v_session.last_admin_activity_at > v_now
     OR v_session.mfa_authenticated_at + interval '8 hours' <= v_now
     OR v_session.last_admin_activity_at + interval '30 minutes' <= v_now
  ) THEN
    RAISE EXCEPTION 'Protected rating feedback unavailable' USING ERRCODE='42501';
  END IF;

  -- A single base cohort produces both numeric metrics and the ordered latest4.
  -- Internal UUID triples never leave the function.
  WITH location_bounds AS (
    SELECT l.id,l.name,l.timezone,
      (p_from::timestamp AT TIME ZONE l.timezone) AS period_start,
      ((p_to+1)::timestamp AT TIME ZONE l.timezone) AS period_end
    FROM public.locations AS l
    WHERE l.organization_id=p_organization_id
      AND (p_location_id IS NULL OR l.id=p_location_id)
  ), completed_visits AS MATERIALIZED (
    SELECT s.id,s.organization_id,s.location_id,s.completed_at,
      r.rating,r.rated_at,b.name AS location_name,b.timezone AS location_timezone
    FROM location_bounds AS b
    JOIN public.valet_sessions AS s
      ON s.organization_id=p_organization_id AND s.location_id=b.id
     AND s.state='COMPLETED' AND s.completed_at >= b.period_start
     AND s.completed_at < b.period_end
    LEFT JOIN public.guest_ratings AS r
      ON r.organization_id=s.organization_id AND r.location_id=s.location_id
     AND r.valet_session_id=s.id
  ), totals AS (
    SELECT count(*)::integer AS eligible, count(rating)::integer AS rated,
      sum(rating)::numeric AS rating_total,
      count(*) FILTER (WHERE rating=5)::integer AS five,
      count(*) FILTER (WHERE rating=4)::integer AS four,
      count(*) FILTER (WHERE rating=3)::integer AS three,
      count(*) FILTER (WHERE rating=2)::integer AS two,
      count(*) FILTER (WHERE rating=1)::integer AS one
    FROM completed_visits
  ), latest AS (
    SELECT * FROM completed_visits WHERE rating IS NOT NULL
    ORDER BY rated_at DESC,completed_at DESC,id DESC LIMIT 4
  ), recent AS (
    SELECT coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'visitReference','VISIT-'||pg_catalog.upper(pg_catalog.substr(
          pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(id::text,'UTF8')),'hex'),1,12)),
        'rating',rating,
        'completedAt',pg_catalog.to_char(completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'ratedAt',pg_catalog.to_char(rated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'authorizedLocationLabel',location_name,'locationTimezone',location_timezone,
        '_org',organization_id,'_loc',location_id,'_visit',id)
      ORDER BY rated_at DESC,completed_at DESC,id DESC
    ),'[]'::jsonb) AS rows FROM latest
  )
  SELECT pg_catalog.jsonb_build_object(
    'eligibleCompletedVisits',t.eligible,'ratedVisits',t.rated,
    'averageRating',CASE WHEN t.rated=0 THEN NULL
      ELSE (t.rating_total/t.rated::numeric)::numeric(20,4)::text END,
    'participationRate',CASE WHEN t.eligible=0 THEN NULL
      ELSE (t.rated::numeric/t.eligible::numeric)::numeric(20,6)::text END,
    'distribution',pg_catalog.jsonb_build_object(
      'five',t.five,'four',t.four,'three',t.three,'two',t.two,'one',t.one),
    'recentRatings',recent.rows
  ),recent.rows INTO v_projection,v_internal FROM totals AS t CROSS JOIN recent;

  IF (SELECT count(*) FROM pg_catalog.jsonb_array_elements(v_internal) AS r)
      <> (SELECT count(DISTINCT r->>'visitReference')
          FROM pg_catalog.jsonb_array_elements(v_internal) AS r) THEN
    RAISE EXCEPTION 'Ambiguous rating reference' USING ERRCODE='42501';
  END IF;
  -- Child rows locked by exact internal triple, sorted UUID, no business-state updates.
  PERFORM 1 FROM public.guest_rating_comments AS c
    JOIN pg_catalog.jsonb_to_recordset(v_internal) AS recent(
      "_org" uuid,"_loc" uuid,"_visit" uuid)
      ON recent."_org"=c.organization_id
     AND recent."_loc"=c.location_id
     AND recent."_visit"=c.valet_session_id
    ORDER BY c.valet_session_id
    FOR SHARE OF c NOWAIT;

  SELECT * INTO v_session FROM public.staff_auth_lock_current_session(
    p_session_id, p_user_id, p_bearer, p_created_at, 'SHARED'
  );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Protected rating feedback unavailable' USING ERRCODE='42501';
  END IF;
  v_now := pg_catalog.clock_timestamp();
  IF v_member.role='ORG_ADMIN' AND (
     v_session.mfa_factor_id IS DISTINCT FROM v_factor
     OR v_session.mfa_authenticated_at IS NULL
     OR v_session.last_admin_activity_at IS NULL
     OR v_session.mfa_authenticated_at > v_now
     OR v_session.last_admin_activity_at > v_now
     OR v_session.mfa_authenticated_at + interval '8 hours' <= v_now
     OR v_session.last_admin_activity_at + interval '30 minutes' <= v_now
  ) THEN
    RAISE EXCEPTION 'Protected rating feedback unavailable' USING ERRCODE='42501';
  END IF;

  -- Fresh READ COMMITTED statement after child locks; expired/held/erased text
  -- is suppressed at final read without hiding the underlying numeric rating.
  SELECT pg_catalog.jsonb_set(v_projection,'{recentRatings}',
    coalesce(pg_catalog.jsonb_agg(
      (recent.row - '_org' - '_loc' - '_visit') ||
      pg_catalog.jsonb_build_object('comment',
        CASE WHEN c.state='PRESENT' AND c.retention_expires_at > pg_catalog.clock_timestamp()
          THEN c.comment_text ELSE NULL END)
      ORDER BY recent.ordinality
    ),'[]'::jsonb))
  INTO v_projection
  FROM pg_catalog.jsonb_array_elements(v_internal) WITH ORDINALITY AS recent(row,ordinality)
  LEFT JOIN public.guest_rating_comments AS c
    ON c.organization_id=(recent.row->>'_org')::uuid
   AND c.location_id=(recent.row->>'_loc')::uuid
   AND c.valet_session_id=(recent.row->>'_visit')::uuid;
  RETURN v_projection;
END;
$reader$;
REVOKE ALL ON FUNCTION
 public.management_rating_feedback_projection(uuid,uuid,text,timestamptz,uuid,uuid,uuid,date,date)
 FROM PUBLIC;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM vaylet_rating_feedback_reader_owner;

-- Final schema inventory. Activation and revised Option C verifier belong
-- solely to separately reviewed stage-aware provisioning, not migrations.
DO $w2_p5_final$
BEGIN
  IF (SELECT COUNT(*) FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
      WHERE r.rolname='vaylet_rating_feedback_reader_owner') <> 2
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc p
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))
       ) AS acl
       WHERE p.oid='public.management_rating_feedback_projection(uuid,uuid,text,timestamptz,uuid,uuid,uuid,date,date)'::regprocedure
         AND acl.privilege_type='EXECUTE' AND acl.grantee<>p.proowner
     )
     OR has_function_privilege('vaylet_rating_feedback_reader_owner',
         'public.staff_auth_lock_current_session(uuid,uuid,text,timestamptz,text)',
         'EXECUTE')
  THEN RAISE EXCEPTION 'ISSUE463_P5_PREPARE_NOT_DORMANT'; END IF;
END;
$w2_p5_final$;
COMMIT;
