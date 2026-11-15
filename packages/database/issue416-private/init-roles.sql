-- Synthetic local roles only; applied automatically to a NEW empty fixture.
CREATE ROLE issue416_w9_test LOGIN PASSWORD 'fixture_w9_test_only'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE issue416_w9_migration LOGIN PASSWORD 'fixture_w9_migration_only'
  NOSUPERUSER NOCREATEDB CREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE issue416_w9_runtime LOGIN PASSWORD 'fixture_w9_runtime_only'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

GRANT CONNECT ON DATABASE issue416_w9_db
  TO issue416_w9_test, issue416_w9_migration, issue416_w9_runtime;
GRANT CREATE ON DATABASE issue416_w9_db TO issue416_w9_migration;
GRANT USAGE, CREATE ON SCHEMA public TO issue416_w9_migration;
GRANT USAGE ON SCHEMA public TO issue416_w9_test, issue416_w9_runtime;
