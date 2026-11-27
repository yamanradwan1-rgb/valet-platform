BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $w2_preflight$
BEGIN
  IF current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r
          WHERE r.rolname=current_user AND r.rolcreaterole
            AND NOT r.rolsuper AND NOT r.rolinherit)
     OR (SELECT d.datdba::regrole::text FROM pg_catalog.pg_database d
          WHERE d.datname=current_database()) <> current_user
     OR (SELECT count(*) FROM pg_catalog.pg_proc
         WHERE oid IN ('public.guest_rating_submit(text,integer)'::regprocedure,
                       'public.guest_browser_rating_submit(text,integer)'::regprocedure)
           AND proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)
           AND prosecdef) <> 2 THEN
    RAISE EXCEPTION 'ISSUE463_P2_MIGRATOR_OR_GUEST_OWNER_INVALID';
  END IF;
END;
$w2_preflight$;
SET LOCAL ROLE vap1_proof_owner;
DO $w2_boundary$
DECLARE v_phase text;
BEGIN
  SELECT phase INTO v_phase
  FROM auth_proof_private.option_c_launch_boundary
  WHERE singleton FOR UPDATE;
  IF NOT FOUND OR v_phase NOT IN ('LEGACY','PROTECTED') THEN
    RAISE EXCEPTION 'ISSUE463_P2_OPTION_C_BOUNDARY_INVALID';
  END IF;
END;
$w2_boundary$;
RESET ROLE;
CREATE SCHEMA rating_feedback_private;
REVOKE ALL ON SCHEMA rating_feedback_private FROM PUBLIC;
-- Role identities are PostgreSQL cluster-global; multiple isolated tenant
-- fixture databases may share one authenticated migrator and these names.
-- The Option C boundary row is per-database, not a cluster-global DDL mutex.
-- For an existing role, refuse *any* unexpected attributes or membership;
-- a duplicate created concurrently is checked rather than blindly accepted.
DO $w2_exact_roles$
DECLARE
  v_name text;
  v_login boolean;
  v_role record;
  v_edge record;
  v_admin integer;
  v_set integer;
  v_index integer;
BEGIN
  FOR v_index IN 1..4 LOOP
    v_name := (ARRAY[
      'vaylet_rating_feedback_reader_owner',
      'vaylet_rating_feedback_privacy_owner',
      'vaylet_rating_feedback_privacy_approver',
      'vaylet_rating_feedback_privacy_executor'
    ])[v_index];
    v_login := v_index>=3;
    SELECT * INTO v_role FROM pg_catalog.pg_roles WHERE rolname=v_name;
    IF NOT FOUND THEN
      BEGIN
        EXECUTE pg_catalog.format(
          'CREATE ROLE %I %s NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
          v_name, CASE WHEN v_login THEN 'LOGIN' ELSE 'NOLOGIN' END
        );
      EXCEPTION WHEN duplicate_object OR unique_violation THEN
        -- Another migration may have committed this cluster-global identity.
        NULL;
      END;
    END IF;
    SELECT * INTO v_role FROM pg_catalog.pg_roles WHERE rolname=v_name;
    IF NOT FOUND OR v_role.rolcanlogin IS DISTINCT FROM v_login
       OR v_role.rolinherit OR v_role.rolsuper OR v_role.rolcreatedb
       OR v_role.rolcreaterole OR v_role.rolreplication OR v_role.rolbypassrls
    THEN
      RAISE EXCEPTION 'ISSUE463_P2_EXISTING_ROLE_ATTRIBUTES_UNSAFE';
    END IF;
    v_admin:=0;
    v_set:=0;
    FOR v_edge IN
      SELECT parent.rolname AS parent,member.rolname AS member,
             grantor.rolname AS grantor,grantor.rolsuper AS super_grantor,
             edge.inherit_option,edge.set_option,edge.admin_option
      FROM pg_catalog.pg_auth_members AS edge
      JOIN pg_catalog.pg_roles AS parent ON parent.oid=edge.roleid
      JOIN pg_catalog.pg_roles AS member ON member.oid=edge.member
      JOIN pg_catalog.pg_roles AS grantor ON grantor.oid=edge.grantor
      WHERE edge.roleid=v_role.oid OR edge.member=v_role.oid
    LOOP
      IF v_edge.parent<>v_name OR v_edge.member<>current_user
         OR v_edge.inherit_option THEN
        RAISE EXCEPTION 'ISSUE463_P2_EXISTING_ROLE_MEMBERSHIP_UNSAFE';
      END IF;
      IF v_edge.admin_option AND NOT v_edge.set_option
         AND v_edge.super_grantor AND v_edge.grantor<>current_user THEN
        v_admin:=v_admin+1;
      ELSIF v_index<=2 AND v_edge.set_option AND NOT v_edge.admin_option
         AND v_edge.grantor=current_user THEN
        v_set:=v_set+1;
      ELSE
        RAISE EXCEPTION 'ISSUE463_P2_EXISTING_ROLE_GRANT_EDGE_UNSAFE';
      END IF;
    END LOOP;
    IF v_admin<>1 OR v_set>1 THEN
      RAISE EXCEPTION 'ISSUE463_P2_EXISTING_ROLE_CREATOR_UNSAFE';
    END IF;
  END LOOP;
END;
$w2_exact_roles$;
-- Creator ADMIN-only edge and separate trusted migration SET-only edge must
-- remain distinct PostgreSQL17 grantor-specific memberships.
DO $w2_owner_grants$
BEGIN
  EXECUTE pg_catalog.format(
    'GRANT %I,%I TO %I WITH INHERIT FALSE, SET TRUE, ADMIN FALSE',
    'vaylet_rating_feedback_reader_owner',
    'vaylet_rating_feedback_privacy_owner',
    current_user
  );
END;
$w2_owner_grants$;
-- NOLOGIN definer owners must not silently inherit PUBLIC EXECUTE on any
-- future function. Explicitly REVOKE each installed routine too.
SET LOCAL ROLE vaylet_rating_feedback_reader_owner;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
RESET ROLE;
SET LOCAL ROLE vaylet_rating_feedback_privacy_owner;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
RESET ROLE;
GRANT USAGE,CREATE ON SCHEMA public TO vaylet_rating_feedback_reader_owner,vaylet_rating_feedback_privacy_owner;
GRANT USAGE ON SCHEMA public TO vaylet_rating_feedback_privacy_approver,vaylet_rating_feedback_privacy_executor;
GRANT USAGE ON SCHEMA rating_feedback_private TO vaylet_rating_feedback_privacy_owner;
SET LOCAL ROLE vap1_proof_owner;
GRANT USAGE ON SCHEMA auth_proof_private TO vaylet_rating_feedback_reader_owner;
GRANT SELECT(singleton,phase) ON auth_proof_private.option_c_launch_boundary TO vaylet_rating_feedback_reader_owner;
RESET ROLE;
SET LOCAL ROLE vaylet_rating_feedback_reader_owner;
CREATE FUNCTION public.rating_feedback_is_protected() RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS
$$ SELECT coalesce((SELECT phase='PROTECTED' FROM auth_proof_private.option_c_launch_boundary WHERE singleton),false) $$;
REVOKE ALL ON FUNCTION public.rating_feedback_is_protected() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rating_feedback_is_protected() TO vaylet_rating_feedback_privacy_owner;
DO $w2_guest_phase_grant$
BEGIN
  EXECUTE pg_catalog.format(
    'GRANT EXECUTE ON FUNCTION public.rating_feedback_is_protected() TO %I',
    session_user
  );
END;
$w2_guest_phase_grant$;
RESET ROLE;
ALTER TABLE public.guest_location_privacy ADD COLUMN rating_feedback_notice_lock_guard bigint NOT NULL DEFAULT 0 CHECK(rating_feedback_notice_lock_guard=0);
CREATE TABLE public.guest_rating_comment_notice_approvals(
 organization_id uuid NOT NULL,location_id uuid NOT NULL,published_version integer NOT NULL,
 approval_case_id uuid NOT NULL,approved_at timestamptz(3) NOT NULL,approver_ref text NOT NULL,
 revoked_at timestamptz(3),revocation_case_id uuid,revoked_by_ref text,
 CONSTRAINT guest_rating_comment_notice_approvals_pkey PRIMARY KEY(organization_id,location_id,published_version),
 FOREIGN KEY(organization_id,location_id,published_version) REFERENCES public.guest_privacy_publications(organization_id,location_id,version),
 CHECK((revoked_at IS NULL AND revocation_case_id IS NULL AND revoked_by_ref IS NULL) OR
       (revoked_at IS NOT NULL AND revocation_case_id IS NOT NULL AND revoked_by_ref IS NOT NULL))
);
REVOKE ALL ON public.guest_rating_comment_notice_approvals FROM PUBLIC;
GRANT SELECT(organization_id,location_id,published_version),UPDATE(rating_feedback_notice_lock_guard) ON public.guest_location_privacy TO vaylet_rating_feedback_privacy_owner;
GRANT SELECT(organization_id,location_id,version,en_text,en_url,ar_text,ar_url) ON public.guest_privacy_publications TO vaylet_rating_feedback_privacy_owner;
GRANT SELECT(organization_id,location_id,published_version,approval_case_id,approved_at,approver_ref,revoked_at,revocation_case_id,revoked_by_ref),
 INSERT(organization_id,location_id,published_version,approval_case_id,approved_at,approver_ref),
 UPDATE(revoked_at,revocation_case_id,revoked_by_ref)
 ON public.guest_rating_comment_notice_approvals TO vaylet_rating_feedback_privacy_owner;
SET LOCAL ROLE vaylet_rating_feedback_privacy_owner;
CREATE FUNCTION public.approve_guest_rating_comment_notice(p_org uuid,p_loc uuid,p_version integer,p_case uuid)
 RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT public.rating_feedback_is_protected() OR session_user<>'vaylet_rating_feedback_privacy_approver' OR p_case IS NULL OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='denied';END IF;
 PERFORM organization_id FROM public.guest_location_privacy WHERE organization_id=p_org AND location_id=p_loc AND published_version=p_version FOR SHARE NOWAIT;
 IF NOT FOUND THEN RETURN 'DENIED';END IF;
 -- A legal approval case is a required independent operator prerequisite.
 -- Only immutable, populated bilingual inline publications can be approved here;
 -- URL-only publications require a separately reviewed immutable archive proof.
 PERFORM version FROM public.guest_privacy_publications WHERE organization_id=p_org AND location_id=p_loc AND version=p_version
   AND length(pg_catalog.btrim(en_text))>0 AND length(pg_catalog.btrim(ar_text))>0;
 IF NOT FOUND THEN RETURN 'DENIED';END IF;
 INSERT INTO public.guest_rating_comment_notice_approvals(organization_id,location_id,published_version,approval_case_id,approved_at,approver_ref)
 VALUES(p_org,p_loc,p_version,p_case,clock_timestamp(),session_user) ON CONFLICT DO NOTHING;
 IF EXISTS(SELECT 1 FROM public.guest_rating_comment_notice_approvals WHERE organization_id=p_org AND location_id=p_loc AND published_version=p_version AND approval_case_id=p_case AND revoked_at IS NULL) THEN RETURN 'APPROVED';END IF;
 RETURN 'DENIED';
END$$;
CREATE FUNCTION public.revoke_guest_rating_comment_notice(p_org uuid,p_loc uuid,p_version integer,p_case uuid)
 RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT public.rating_feedback_is_protected() OR session_user<>'vaylet_rating_feedback_privacy_approver' OR p_case IS NULL OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='denied';END IF;
 PERFORM organization_id FROM public.guest_location_privacy WHERE organization_id=p_org AND location_id=p_loc FOR SHARE NOWAIT;
 IF NOT FOUND THEN RETURN 'DENIED';END IF;
 UPDATE public.guest_rating_comment_notice_approvals SET revoked_at=clock_timestamp(),revocation_case_id=p_case,revoked_by_ref=session_user
 WHERE organization_id=p_org AND location_id=p_loc AND published_version=p_version AND revoked_at IS NULL;
 IF EXISTS(SELECT 1 FROM public.guest_rating_comment_notice_approvals WHERE organization_id=p_org AND location_id=p_loc AND published_version=p_version AND revocation_case_id=p_case AND revoked_by_ref=session_user) THEN RETURN 'REVOKED';END IF;
 RETURN 'DENIED';
END$$;
REVOKE ALL ON FUNCTION public.approve_guest_rating_comment_notice(uuid,uuid,integer,uuid),public.revoke_guest_rating_comment_notice(uuid,uuid,integer,uuid) FROM PUBLIC;

RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM vaylet_rating_feedback_privacy_owner;
CREATE FUNCTION rating_feedback_private.notice_ready(p_org uuid,p_loc uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $$
DECLARE v integer;BEGIN
 SELECT published_version INTO v FROM public.guest_location_privacy WHERE organization_id=p_org AND location_id=p_loc FOR SHARE NOWAIT;
 IF v IS NULL THEN RETURN false;END IF;
 PERFORM published_version FROM public.guest_rating_comment_notice_approvals WHERE organization_id=p_org AND location_id=p_loc AND published_version=v AND revoked_at IS NULL FOR SHARE NOWAIT;
 RETURN FOUND;
END$$;
REVOKE ALL ON FUNCTION rating_feedback_private.notice_ready(uuid,uuid) FROM PUBLIC;
CREATE FUNCTION rating_feedback_private.canonical_comment(p_text text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $body$
DECLARE
  v text;
  cp integer;
  trims text;
BEGIN
  IF p_text IS NULL THEN RETURN NULL; END IF;
  IF char_length(p_text)>1000 OR octet_length(p_text)>4000 THEN
    RAISE EXCEPTION 'REQUEST_INVALID' USING ERRCODE='22023';
  END IF;
  IF char_length(p_text)=0 THEN RETURN NULL; END IF;
  FOR cp IN
    SELECT pg_catalog.ascii(c)
    FROM pg_catalog.regexp_split_to_table(p_text COLLATE pg_catalog."C",'') AS c
  LOOP
    IF (cp BETWEEN 0 AND 31 AND cp NOT IN (9,10,13))
       OR cp BETWEEN 127 AND 159
       OR cp BETWEEN 8234 AND 8238
       OR cp BETWEEN 8294 AND 8297 THEN
      RAISE EXCEPTION 'REQUEST_INVALID' USING ERRCODE='22023';
    END IF;
  END LOOP;
  SELECT pg_catalog.string_agg(pg_catalog.chr(n),'' ORDER BY n) INTO trims
  FROM pg_catalog.unnest(ARRAY[9,10,32,160,5760,8192,8193,8194,8195,8196,
    8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288]) AS n;
  v := pg_catalog.btrim(pg_catalog.replace(
    pg_catalog.replace(p_text COLLATE pg_catalog."C",chr(13)||chr(10),chr(10)),
    chr(13),chr(10)),trims);
  IF char_length(v)>1000 OR octet_length(v)>4000 THEN
    RAISE EXCEPTION 'REQUEST_INVALID' USING ERRCODE='22023';
  END IF;
  IF char_length(v)=0 THEN RETURN NULL; END IF;
  RETURN v;
END $body$;


CREATE TYPE public.guest_rating_comment_state AS ENUM ('PRESENT', 'HELD', 'ERASED');
CREATE TABLE public.guest_rating_comments (
 organization_id uuid NOT NULL,location_id uuid NOT NULL,
 valet_session_id uuid PRIMARY KEY REFERENCES public.guest_ratings(valet_session_id) ON DELETE RESTRICT,
 comment_text text, state public.guest_rating_comment_state NOT NULL,
 retention_expires_at timestamptz(3) NOT NULL, notice_version integer NOT NULL,
 hold_case_id uuid, erase_pending boolean NOT NULL DEFAULT false, erased_at timestamptz(3),
 rating_feedback_lock_guard bigint NOT NULL DEFAULT 0 CHECK(rating_feedback_lock_guard=0),
 CONSTRAINT guest_rating_comments_visit_fkey FOREIGN KEY(organization_id,location_id,valet_session_id) REFERENCES public.valet_sessions(organization_id,location_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT guest_rating_comments_notice_fkey FOREIGN KEY(organization_id,location_id,notice_version) REFERENCES public.guest_rating_comment_notice_approvals(organization_id,location_id,published_version) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CHECK((state='ERASED')=(comment_text IS NULL)),
 CHECK((state='ERASED')=(erased_at IS NOT NULL)),
 CHECK((state='HELD')=(hold_case_id IS NOT NULL)),
 CHECK(NOT erase_pending OR state='HELD'),
 CHECK(comment_text IS NULL OR (rating_feedback_private.canonical_comment(comment_text) IS NOT NULL AND convert_to(comment_text,'UTF8')=convert_to(rating_feedback_private.canonical_comment(comment_text),'UTF8')))
);
REVOKE ALL ON public.guest_rating_comments FROM PUBLIC;
CREATE INDEX guest_rating_comments_expiry_due_idx
  ON public.guest_rating_comments(retention_expires_at,valet_session_id)
  WHERE state = 'PRESENT';
CREATE FUNCTION rating_feedback_private.guest_comment_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $guard$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.state = 'ERASED' OR current_user <> 'vaylet_rating_feedback_privacy_owner' THEN
    RAISE EXCEPTION 'Immutable Guest feedback.' USING ERRCODE = '55000';
  END IF;
  IF (NEW.organization_id,NEW.location_id,NEW.valet_session_id,NEW.retention_expires_at,
      NEW.notice_version,NEW.rating_feedback_lock_guard)
     IS DISTINCT FROM
     (OLD.organization_id,OLD.location_id,OLD.valet_session_id,OLD.retention_expires_at,
      OLD.notice_version,OLD.rating_feedback_lock_guard)
     OR (NEW.comment_text IS DISTINCT FROM OLD.comment_text AND NEW.comment_text IS NOT NULL)
     OR NEW.comment_text IS NOT DISTINCT FROM OLD.comment_text AND NEW.state='ERASED' THEN
    RAISE EXCEPTION 'Immutable Guest feedback.' USING ERRCODE = '55000';
  END IF;
  IF OLD.state='PRESENT' THEN
    IF NOT (
       (NEW.state='HELD' AND NEW.comment_text IS NOT DISTINCT FROM OLD.comment_text
         AND NEW.hold_case_id IS NOT NULL AND NOT NEW.erase_pending AND NEW.erased_at IS NULL)
       OR
       (NEW.state='ERASED' AND NEW.comment_text IS NULL AND NEW.hold_case_id IS NULL
         AND NOT NEW.erase_pending AND NEW.erased_at IS NOT NULL)
    ) THEN RAISE EXCEPTION 'Invalid privacy transition.' USING ERRCODE='55000'; END IF;
  ELSIF OLD.state='HELD' THEN
    IF NOT (
      (NEW.state='HELD' AND NEW.comment_text IS NOT DISTINCT FROM OLD.comment_text
       AND NEW.hold_case_id=OLD.hold_case_id AND NEW.erased_at IS NULL
       AND NOT OLD.erase_pending AND NEW.erase_pending)
      OR
      (NEW.state='PRESENT' AND NEW.comment_text IS NOT DISTINCT FROM OLD.comment_text
       AND NEW.hold_case_id IS NULL AND NOT NEW.erase_pending AND NEW.erased_at IS NULL
       AND NOT OLD.erase_pending AND OLD.retention_expires_at>clock_timestamp())
      OR
      (NEW.state='ERASED' AND NEW.comment_text IS NULL AND NEW.hold_case_id IS NULL
       AND NOT NEW.erase_pending AND NEW.erased_at IS NOT NULL)
    ) THEN RAISE EXCEPTION 'Invalid privacy transition.' USING ERRCODE='55000'; END IF;
  ELSE
    RAISE EXCEPTION 'Immutable Guest feedback.' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$guard$;
CREATE TRIGGER guest_rating_comment_privacy_guard BEFORE UPDATE OR DELETE ON public.guest_rating_comments FOR EACH ROW EXECUTE FUNCTION rating_feedback_private.guest_comment_guard();
REVOKE ALL ON FUNCTION rating_feedback_private.guest_comment_guard(),rating_feedback_private.canonical_comment(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rating_feedback_private.canonical_comment(text) TO vaylet_rating_feedback_privacy_owner;
GRANT SELECT(organization_id,location_id,valet_session_id,comment_text,state,retention_expires_at),UPDATE(rating_feedback_lock_guard) ON public.guest_rating_comments TO vaylet_rating_feedback_reader_owner;
GRANT SELECT(organization_id,location_id,valet_session_id,state,retention_expires_at,hold_case_id,erase_pending,erased_at),UPDATE(state,comment_text,hold_case_id,erase_pending,erased_at) ON public.guest_rating_comments TO vaylet_rating_feedback_privacy_owner;
CREATE FUNCTION rating_feedback_private.rating_core(
  p_secret text, p_rating integer, p_comment text, p_expected uuid,
  p_browser boolean, p_legacy boolean
) RETURNS TABLE(
  result_code text, valet_session_id uuid, rating integer, rated_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE
  v_sid uuid;
  v_org uuid;
  v_loc uuid;
  v_state public.valet_session_state;
  v_completed timestamptz;
  v_expires timestamptz;
  v_revoked timestamptz;
  v_consumed timestamptz;
  v_scope text;
  v_existing integer;
  v_text text;
  v_rated timestamptz;
  v_canonical text;
  v_comment_state public.guest_rating_comment_state;
  v_comment_expires timestamptz;
  v_now timestamptz;
  v_version integer;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Guest feedback requires READ COMMITTED' USING ERRCODE='42501';
  END IF;
  IF NOT p_legacy AND NOT public.rating_feedback_is_protected() THEN
    RETURN QUERY SELECT 'FEEDBACK_UNAVAILABLE'::text,NULL::uuid,NULL::integer,NULL::timestamptz;
    RETURN;
  END IF;
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5
     OR p_browser IS NULL OR p_legacy IS NULL
     OR (NOT p_legacy AND p_expected IS NULL)
     OR (p_legacy AND (p_expected IS NOT NULL OR p_comment IS NOT NULL)) THEN
    RETURN QUERY SELECT 'REQUEST_INVALID'::text,NULL::uuid,NULL::integer,NULL::timestamptz;
    RETURN;
  END IF;
  BEGIN
    v_canonical := rating_feedback_private.canonical_comment(p_comment);
  EXCEPTION WHEN SQLSTATE '22023' THEN
    RETURN QUERY SELECT 'REQUEST_INVALID'::text,NULL::uuid,NULL::integer,NULL::timestamptz;
    RETURN;
  END;
  IF p_browser THEN
    SELECT resolved.valet_session_id, resolved.authority_scope
      INTO v_sid,v_scope
      FROM public.guest_browser_resolve(p_secret,TRUE) AS resolved
     WHERE resolved.result_code='OK';
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'INVALID_ACCESS'::text,NULL::uuid,NULL::integer,NULL::timestamptz;
      RETURN;
    END IF;
    IF v_scope<>'POST_VISIT' THEN
      RETURN QUERY SELECT 'NOT_COMPLETED'::text,v_sid,NULL::integer,NULL::timestamptz;
      RETURN;
    END IF;
    SELECT organization_id,location_id INTO v_org,v_loc
      FROM public.valet_sessions WHERE id=v_sid;
  ELSE
    IF p_secret IS NULL OR p_secret !~ '^[A-Za-z0-9_-]{43}$' THEN
      RETURN QUERY SELECT 'INVALID_ACCESS'::text,NULL::uuid,NULL::integer,NULL::timestamptz;
      RETURN;
    END IF;
    SELECT session.id,session.organization_id,session.location_id,
           session.state,session.completed_at,session.customer_access_expires_at,
           session.customer_access_revoked_at,session.customer_access_consumed_at
      INTO v_sid,v_org,v_loc,v_state,v_completed,v_expires,v_revoked,v_consumed
      FROM public.valet_sessions AS session
     WHERE session.customer_access_token_hash=public.guest_browser_hash_secret(p_secret)
     FOR UPDATE OF session;
    v_now:=pg_catalog.clock_timestamp();
    IF NOT FOUND OR v_revoked IS NOT NULL OR v_consumed IS NOT NULL
       OR v_expires<=v_now OR v_state='CANCELLED'::public.valet_session_state THEN
      RETURN QUERY SELECT 'INVALID_ACCESS'::text,NULL::uuid,NULL::integer,NULL::timestamptz;
      RETURN;
    END IF;
    IF v_state<>'COMPLETED'::public.valet_session_state OR v_completed IS NULL THEN
      RETURN QUERY SELECT 'NOT_COMPLETED'::text,v_sid,NULL::integer,NULL::timestamptz;
      RETURN;
    END IF;
    IF v_completed+INTERVAL '24 hours'<=pg_catalog.clock_timestamp() THEN
      RETURN QUERY SELECT 'INVALID_ACCESS'::text,NULL::uuid,NULL::integer,NULL::timestamptz;
      RETURN;
    END IF;
  END IF;
  IF NOT p_legacy AND v_sid IS DISTINCT FROM p_expected THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::text,NULL::uuid,NULL::integer,NULL::timestamptz;
    RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM public.guest_rating_comments AS erasure WHERE erasure.valet_session_id=v_sid AND erasure.state IN ('ERASED','HELD')) THEN
    RETURN QUERY SELECT 'CONFLICT'::text,v_sid,NULL::integer,NULL::timestamptz;
    RETURN;
  END IF;
  SELECT original.rating,original.rated_at
    INTO v_existing,v_rated
    FROM public.guest_ratings AS original WHERE original.valet_session_id=v_sid;
  IF FOUND THEN
    SELECT child.comment_text,child.state,child.retention_expires_at INTO v_text,v_comment_state,v_comment_expires FROM public.guest_rating_comments AS child
     WHERE child.valet_session_id=v_sid;
    IF v_comment_state IS NOT NULL AND
       (v_comment_state <> 'PRESENT' OR v_comment_expires <= clock_timestamp()) THEN
      RETURN QUERY SELECT 'CONFLICT'::text,v_sid,NULL::integer,NULL::timestamptz;
      RETURN;
    END IF;
    IF v_existing=p_rating AND
       convert_to(v_text,'UTF8') IS NOT DISTINCT FROM convert_to(v_canonical,'UTF8') THEN
      RETURN QUERY SELECT 'OK'::text,v_sid,v_existing,v_rated;
    ELSE
      RETURN QUERY SELECT 'CONFLICT'::text,v_sid,NULL::integer,NULL::timestamptz;
    END IF;
    RETURN;
  END IF;
  IF v_canonical IS NOT NULL THEN
    IF NOT public.rating_feedback_is_protected() OR NOT rating_feedback_private.notice_ready(v_org,v_loc) THEN
      RETURN QUERY SELECT 'FEEDBACK_UNAVAILABLE'::text,v_sid,NULL::integer,NULL::timestamptz;
      RETURN;
    END IF;
    SELECT published_version INTO v_version FROM public.guest_location_privacy WHERE organization_id=v_org AND location_id=v_loc;
  END IF;
  INSERT INTO public.guest_ratings AS original
    (organization_id,location_id,valet_session_id,rating)
    VALUES(v_org,v_loc,v_sid,p_rating)
    RETURNING original.rated_at INTO v_rated;
  IF v_canonical IS NOT NULL THEN
    INSERT INTO public.guest_rating_comments(organization_id,location_id,valet_session_id,comment_text,state,retention_expires_at,notice_version)
    VALUES(v_org,v_loc,v_sid,v_canonical,'PRESENT',v_rated+interval '30 days',v_version);
  END IF;
  RETURN QUERY SELECT 'OK'::text,v_sid,p_rating,v_rated;
END $body$;

-- Retain the historical two-argument ABI and SQL result shape exactly.
CREATE OR REPLACE FUNCTION public.guest_rating_submit(
  p_guest_token text,p_rating integer)
RETURNS TABLE(result_code text,valet_session_id uuid,rating integer,rated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog, public AS $body$
  SELECT * FROM rating_feedback_private.rating_core($1,$2,NULL,NULL,FALSE,TRUE);
$body$;
CREATE OR REPLACE FUNCTION public.guest_browser_rating_submit(
  p_browser_token text,p_rating integer)
RETURNS TABLE(result_code text,valet_session_id uuid,rating integer,rated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog, public AS $body$
  SELECT * FROM rating_feedback_private.rating_core($1,$2,NULL,NULL,TRUE,TRUE);
$body$;

-- New exact-visit asserted 4-arg interfaces with no default arguments.
CREATE FUNCTION public.guest_rating_submit(text,integer,text,uuid)
RETURNS TABLE(result_code text,valet_session_id uuid,rating integer,rated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $body$
  SELECT * FROM rating_feedback_private.rating_core($1,$2,$3,$4,FALSE,FALSE);
$body$;
CREATE FUNCTION public.guest_browser_rating_submit(text,integer,text,uuid)
RETURNS TABLE(result_code text,valet_session_id uuid,rating integer,rated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $body$
  SELECT * FROM rating_feedback_private.rating_core($1,$2,$3,$4,TRUE,FALSE);
$body$;


REVOKE ALL ON FUNCTION rating_feedback_private.rating_core(text,integer,text,uuid,boolean,boolean),
 public.guest_rating_submit(text,integer,text,uuid),public.guest_browser_rating_submit(text,integer,text,uuid) FROM PUBLIC;
GRANT CREATE ON SCHEMA public TO vaylet_rating_feedback_privacy_owner;
ALTER TABLE public.valet_sessions ADD COLUMN rating_feedback_privacy_lock_guard bigint NOT NULL DEFAULT 0 CHECK(rating_feedback_privacy_lock_guard=0);
GRANT SELECT(id,organization_id,location_id,state,completed_at),UPDATE(rating_feedback_privacy_lock_guard) ON public.valet_sessions TO vaylet_rating_feedback_privacy_owner;
CREATE TABLE public.guest_rating_comment_privacy_commands (
 approval_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,location_id uuid NOT NULL,visit_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('HOLD','ERASE','RELEASE','EXPIRE')),
 case_id uuid NOT NULL,
 approved_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
 valid_until timestamptz(3) NOT NULL, approved_by text NOT NULL,
 completed_at timestamptz(3), executed_by text,outcome text,
 CONSTRAINT guest_rating_comment_commands_visit_fkey
   FOREIGN KEY(organization_id,location_id,visit_id)
   REFERENCES public.valet_sessions(organization_id,location_id,id)
   ON UPDATE RESTRICT ON DELETE RESTRICT,
 CHECK ((completed_at IS NULL AND executed_by IS NULL AND outcome IS NULL)
     OR (completed_at IS NOT NULL AND executed_by IS NOT NULL AND outcome IS NOT NULL)),
 CHECK ((action='EXPIRE')=(approved_by='SYSTEM_EXPIRY'))
);
-- Human approval cannot preclaim any system expiry action: the approval procedure
-- only permits HOLD/RELEASE/ERASE; the internal expiry writer generates UUIDs.
-- One expiry receipt per visit, independently of arbitrary human approval IDs.
CREATE UNIQUE INDEX guest_rating_comment_one_expiry_per_visit_idx
 ON public.guest_rating_comment_privacy_commands(visit_id) WHERE action='EXPIRE';
REVOKE ALL ON TABLE public.guest_rating_comment_privacy_commands FROM PUBLIC;
GRANT SELECT(approval_id,organization_id,location_id,visit_id,action,case_id,valid_until,approved_by,completed_at,executed_by,outcome),
 INSERT(approval_id,organization_id,location_id,visit_id,action,case_id,valid_until,approved_by),
 UPDATE(completed_at,executed_by,outcome) ON public.guest_rating_comment_privacy_commands TO vaylet_rating_feedback_privacy_owner;
SET LOCAL ROLE vaylet_rating_feedback_privacy_owner;
CREATE FUNCTION public.approve_guest_rating_comment_disposition(p_id uuid,p_org uuid,p_loc uuid,p_visit uuid,p_action text,p_case uuid,p_until timestamptz)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT public.rating_feedback_is_protected() OR current_setting('transaction_isolation')<>'read committed' OR session_user<>'vaylet_rating_feedback_privacy_approver' THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501';END IF;
 IF p_id IS NULL OR p_org IS NULL OR p_loc IS NULL OR p_visit IS NULL
    OR p_action IS NULL OR p_action NOT IN ('HOLD','ERASE','RELEASE')
    OR p_case IS NULL OR p_until IS NULL OR p_until<=clock_timestamp()
 THEN RETURN 'DENIED';END IF;
 INSERT INTO public.guest_rating_comment_privacy_commands(approval_id,organization_id,location_id,visit_id,action,case_id,valid_until,approved_by)
 VALUES(p_id,p_org,p_loc,p_visit,p_action,p_case,p_until,session_user) ON CONFLICT DO NOTHING;
 IF EXISTS(SELECT 1 FROM public.guest_rating_comment_privacy_commands WHERE approval_id=p_id AND organization_id=p_org AND location_id=p_loc AND visit_id=p_visit AND action=p_action AND case_id=p_case AND valid_until=p_until AND approved_by=session_user) THEN RETURN 'APPROVED';END IF;
 RETURN 'DENIED';
END$$;
CREATE FUNCTION public.apply_guest_rating_comment_disposition(p_id uuid) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c record;v record;x record; result text;
BEGIN
 IF NOT public.rating_feedback_is_protected() OR current_setting('transaction_isolation')<>'read committed' OR session_user<>'vaylet_rating_feedback_privacy_executor' THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501';END IF;
 SELECT approval_id,organization_id,location_id,visit_id,action,case_id,
        valid_until,approved_by,completed_at,executed_by,outcome
   INTO c FROM public.guest_rating_comment_privacy_commands
   WHERE approval_id=p_id FOR UPDATE;
 IF NOT FOUND OR c.approved_by=session_user OR c.action='EXPIRE' THEN RETURN 'DENIED';END IF;
 IF c.completed_at IS NOT NULL THEN RETURN c.outcome;END IF;
 IF c.valid_until<=clock_timestamp() THEN RETURN 'EXPIRED';END IF;
 SELECT id,completed_at INTO v FROM public.valet_sessions WHERE id=c.visit_id AND organization_id=c.organization_id AND location_id=c.location_id AND state='COMPLETED' AND completed_at IS NOT NULL FOR UPDATE;
 IF NOT FOUND OR c.valid_until<=clock_timestamp() THEN RETURN 'DENIED';END IF;
 SELECT state,hold_case_id,erase_pending,retention_expires_at INTO x FROM public.guest_rating_comments WHERE valet_session_id=c.visit_id FOR UPDATE;
 IF NOT FOUND THEN
  IF c.action<>'ERASE' THEN RETURN 'DENIED';END IF;
  IF v.completed_at IS NULL OR v.completed_at+interval '24h'>clock_timestamp() THEN RETURN 'NO_RECORD_WAIT';END IF;
  result:='NO_RECORD_CLOSED';
 ELSIF x.state='ERASED' AND c.action='ERASE' THEN result:='ERASED';
 ELSIF x.state='ERASED' THEN RETURN 'DENIED';
 ELSIF c.action='HOLD' AND x.state='PRESENT' THEN
  UPDATE public.guest_rating_comments SET state='HELD',hold_case_id=c.case_id WHERE valet_session_id=c.visit_id;result:='HELD';
 ELSIF c.action='ERASE' AND x.state='HELD' AND NOT x.erase_pending THEN
  UPDATE public.guest_rating_comments SET erase_pending=true WHERE valet_session_id=c.visit_id;result:='HELD_PENDING';
 ELSIF c.action='RELEASE' AND x.state='HELD' AND x.hold_case_id=c.case_id AND NOT x.erase_pending AND x.retention_expires_at>clock_timestamp() THEN
  UPDATE public.guest_rating_comments SET state='PRESENT',hold_case_id=NULL WHERE valet_session_id=c.visit_id;result:='RELEASED';
 ELSIF (c.action='ERASE' AND x.state='PRESENT') OR (c.action='RELEASE' AND x.state='HELD' AND x.hold_case_id=c.case_id) THEN
  UPDATE public.guest_rating_comments SET state='ERASED',comment_text=NULL,erased_at=clock_timestamp(),hold_case_id=NULL,erase_pending=false WHERE valet_session_id=c.visit_id;result:='ERASED';
 ELSE RETURN 'DENIED';END IF;
 UPDATE public.guest_rating_comment_privacy_commands SET completed_at=clock_timestamp(),executed_by=session_user,outcome=result WHERE approval_id=p_id;
 RETURN result;
END$$;
CREATE FUNCTION public.expire_guest_rating_comments(p_limit integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $expiry$
DECLARE
 v uuid;
 n integer := 0;
 c record;
 receipt uuid;
BEGIN
 IF NOT public.rating_feedback_is_protected()
    OR current_setting('transaction_isolation') <> 'read committed'
    OR session_user <> 'vaylet_rating_feedback_privacy_executor'
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501'; END IF;
 -- Inspect more than p_limit candidates so an early busy visit does not
 -- suppress the next free due visit. The scan remains strictly bounded.
 FOR v IN
   SELECT valet_session_id FROM public.guest_rating_comments
   WHERE state='PRESENT' AND retention_expires_at<=clock_timestamp()
   ORDER BY retention_expires_at,valet_session_id
   LIMIT LEAST(p_limit * 16,1600)
 LOOP
   EXIT WHEN n>=p_limit;
   BEGIN
     PERFORM id FROM public.valet_sessions
       WHERE id=v AND state='COMPLETED' FOR UPDATE NOWAIT;
     IF NOT FOUND THEN CONTINUE; END IF;
     SELECT organization_id,location_id,
            (state='PRESENT' AND retention_expires_at<=clock_timestamp()) AS due
       INTO c
       FROM public.guest_rating_comments
       WHERE valet_session_id=v FOR UPDATE NOWAIT;
     IF NOT FOUND OR NOT c.due THEN CONTINUE; END IF;
     IF EXISTS (SELECT 1 FROM public.guest_rating_comment_privacy_commands
         WHERE visit_id=v AND action='EXPIRE') THEN
       RAISE EXCEPTION 'expiry receipt inconsistency' USING ERRCODE='55000';
     END IF;
     receipt := pg_catalog.gen_random_uuid();
     UPDATE public.guest_rating_comments
       SET state='ERASED',comment_text=NULL,erased_at=clock_timestamp()
       WHERE valet_session_id=v AND state='PRESENT' AND
             retention_expires_at<=clock_timestamp();
     IF NOT FOUND THEN CONTINUE; END IF;
     INSERT INTO public.guest_rating_comment_privacy_commands
       (approval_id,organization_id,location_id,visit_id,action,case_id,
        valid_until,approved_by)
       VALUES(receipt,c.organization_id,c.location_id,v,'EXPIRE',
         pg_catalog.gen_random_uuid(),clock_timestamp(),'SYSTEM_EXPIRY');
     UPDATE public.guest_rating_comment_privacy_commands
       SET completed_at=clock_timestamp(),executed_by=session_user,outcome='ERASED'
       WHERE approval_id=receipt;
     n := n+1;
   EXCEPTION WHEN lock_not_available THEN
     CONTINUE;
   END;
 END LOOP;
 RETURN n;
END;
$expiry$;
REVOKE ALL ON FUNCTION public.approve_guest_rating_comment_disposition(uuid,uuid,uuid,uuid,text,uuid,timestamptz),public.apply_guest_rating_comment_disposition(uuid),public.expire_guest_rating_comments(integer) FROM PUBLIC;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM vaylet_rating_feedback_reader_owner,vaylet_rating_feedback_privacy_owner;
COMMIT;
