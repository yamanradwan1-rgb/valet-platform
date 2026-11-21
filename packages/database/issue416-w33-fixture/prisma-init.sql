-- Local-only W33 fresh Prisma fixture, no real operator or staff credentials.
CREATE ROLE issue416_w33_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;
