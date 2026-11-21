DO $staff_session_lock_owner$
DECLARE
  v_owner_oid oid;
  v_migrator_oid oid;
  v_database_owner_oid oid;
  v_migrator_superuser boolean;
BEGIN
  SELECT oid, rolsuper INTO v_migrator_oid, v_migrator_superuser
  FROM pg_catalog.pg_roles WHERE rolname = current_user;
  SELECT datdba INTO v_database_owner_oid
  FROM pg_catalog.pg_database WHERE datname = current_database();

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'vaylet_staff_session_lock_owner'
  ) THEN
    EXECUTE 'CREATE ROLE vaylet_staff_session_lock_owner '
      'NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE '
      'NOREPLICATION NOBYPASSRLS';
  END IF;

  SELECT oid INTO v_owner_oid
  FROM pg_catalog.pg_roles
  WHERE rolname = 'vaylet_staff_session_lock_owner'
    AND rolcanlogin = false AND rolinherit = false
    AND rolsuper = false AND rolcreatedb = false
    AND rolcreaterole = false AND rolreplication = false
    AND rolbypassrls = false;
  IF v_owner_oid IS NULL THEN
    RAISE EXCEPTION 'Staff session lock owner role attributes are unsafe';
  END IF;

  IF NOT v_migrator_superuser THEN
    EXECUTE pg_catalog.format(
      'GRANT %I TO %I WITH INHERIT FALSE, SET TRUE',
      'vaylet_staff_session_lock_owner', current_user);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members
    WHERE member = v_owner_oid
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members membership
    WHERE membership.roleid = v_owner_oid
      AND NOT (
        (membership.member = v_migrator_oid
          AND membership.set_option = true
          AND membership.inherit_option = false
          AND membership.admin_option = false)
        OR
        (membership.member = v_database_owner_oid
          AND membership.set_option = false
          AND membership.inherit_option = false
          AND membership.admin_option = true)
      )
  ) THEN
    RAISE EXCEPTION 'Staff session lock owner role membership is unsafe';
  END IF;
END;
$staff_session_lock_owner$;

ALTER TABLE public.staff_auth_sessions
  ADD COLUMN runtime_lock_version bigint NOT NULL DEFAULT 0;
ALTER TABLE public.users
  ADD COLUMN runtime_lock_version bigint NOT NULL DEFAULT 0;

GRANT USAGE, CREATE ON SCHEMA public TO vaylet_staff_session_lock_owner;
GRANT SELECT (
  id, user_id, created_at, current_access_token_hash, revoked_at,
  access_expires_at, absolute_expires_at, mfa_authenticated_at,
  mfa_factor_id, last_admin_activity_at
) ON TABLE public.staff_auth_sessions
  TO vaylet_staff_session_lock_owner;
GRANT SELECT (id, status) ON TABLE public.users
  TO vaylet_staff_session_lock_owner;
GRANT UPDATE (runtime_lock_version) ON TABLE public.staff_auth_sessions
  TO vaylet_staff_session_lock_owner;
GRANT UPDATE (runtime_lock_version) ON TABLE public.users
  TO vaylet_staff_session_lock_owner;

DO $staff_session_lock_privileges$
DECLARE
  v_table text;
  v_column text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['staff_auth_sessions', 'users'] LOOP
    IF pg_catalog.has_table_privilege(
         'vaylet_staff_session_lock_owner', 'public.' || v_table, 'SELECT')
       OR pg_catalog.has_table_privilege(
         'vaylet_staff_session_lock_owner', 'public.' || v_table, 'INSERT')
       OR pg_catalog.has_table_privilege(
         'vaylet_staff_session_lock_owner', 'public.' || v_table, 'UPDATE')
       OR pg_catalog.has_table_privilege(
         'vaylet_staff_session_lock_owner', 'public.' || v_table, 'DELETE')
       OR pg_catalog.has_table_privilege(
         'vaylet_staff_session_lock_owner', 'public.' || v_table, 'TRUNCATE')
       OR pg_catalog.has_table_privilege(
         'vaylet_staff_session_lock_owner', 'public.' || v_table, 'REFERENCES')
       OR pg_catalog.has_table_privilege(
         'vaylet_staff_session_lock_owner', 'public.' || v_table, 'TRIGGER') THEN
      RAISE EXCEPTION 'Staff session lock owner has table-level mutation privileges';
    END IF;
    IF pg_catalog.has_table_privilege(
         'vaylet_staff_session_lock_owner', 'public.' || v_table, 'MAINTAIN') THEN
      RAISE EXCEPTION 'Staff session lock owner has table-level MAINTAIN privilege';
    END IF;
    FOR v_column IN
      SELECT attribute.attname::text
      FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid = ('public.' || v_table)::regclass
        AND attribute.attnum > 0 AND NOT attribute.attisdropped
    LOOP
      IF pg_catalog.has_column_privilege(
           'vaylet_staff_session_lock_owner', 'public.' || v_table,
           v_column, 'SELECT') IS DISTINCT FROM (
             (v_table = 'users' AND v_column IN ('id', 'status'))
             OR
             (v_table = 'staff_auth_sessions' AND v_column IN (
               'id', 'user_id', 'created_at', 'current_access_token_hash',
               'revoked_at', 'access_expires_at', 'absolute_expires_at',
               'mfa_authenticated_at', 'mfa_factor_id', 'last_admin_activity_at'
             ))
           ) THEN
        RAISE EXCEPTION 'Staff session lock owner has unexpected SELECT column privilege';
      END IF;
      IF pg_catalog.has_column_privilege(
           'vaylet_staff_session_lock_owner', 'public.' || v_table,
           v_column, 'UPDATE') IS DISTINCT FROM (v_column = 'runtime_lock_version') THEN
        RAISE EXCEPTION 'Staff session lock owner has unexpected UPDATE column privilege';
      END IF;
      IF pg_catalog.has_column_privilege(
           'vaylet_staff_session_lock_owner', 'public.' || v_table,
           v_column, 'INSERT')
         OR pg_catalog.has_column_privilege(
           'vaylet_staff_session_lock_owner', 'public.' || v_table,
           v_column, 'REFERENCES') THEN
        RAISE EXCEPTION 'Staff session lock owner has unexpected column privilege';
      END IF;
    END LOOP;
  END LOOP;
END;
$staff_session_lock_privileges$;
