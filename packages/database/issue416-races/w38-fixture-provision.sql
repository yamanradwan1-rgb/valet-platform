-- Only for the disposable W38 fixture, after Docker ID/labels/port attestation.
-- The caller supplies a disposable secret via ISSUE416_W38_FIXTURE_PASSWORD.
\set ON_ERROR_STOP on
\getenv fixture_password ISSUE416_W38_FIXTURE_PASSWORD
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'issue416_w38_db'
    OR current_user <> 'issue416_w38_owner'
    OR current_setting('server_version_num')::integer < 170000
    OR current_setting('server_version_num')::integer >= 180000
  THEN
    RAISE EXCEPTION 'W38_UNTRUSTED_FIXTURE';
  END IF;
END $$;
COMMENT ON DATABASE issue416_w38_db IS 'VAYLET_416_W38_DISPOSABLE_PG17_20261114';
CREATE ROLE issue416_w38_migrator LOGIN NOSUPERUSER NOCREATEDB CREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD :'fixture_password';
CREATE ROLE issue416_w38_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD :'fixture_password';
CREATE ROLE issue416_w38_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD :'fixture_password';
GRANT CONNECT ON DATABASE issue416_w38_db TO
  issue416_w38_migrator, issue416_w38_runtime, issue416_w38_test;
GRANT CREATE ON DATABASE issue416_w38_db TO issue416_w38_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO issue416_w38_migrator;
GRANT USAGE ON SCHEMA public TO issue416_w38_runtime, issue416_w38_test;
COMMIT;
