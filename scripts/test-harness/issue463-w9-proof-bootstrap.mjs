import {
  ownedPsql,
} from "./issue463-w9-proof-docker.mjs";

const attributes =
  "NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS";

export async function bootstrapExactCiRoles(identity) {
  // Exact CI bootstrap superuser, separate NOINHERIT/CREATEROLE migrator.
  const bootstrap = [
    `CREATE ROLE vap1_proof_owner NOLOGIN ${attributes};`,
    `CREATE ROLE vaylet_staff_session_lock_owner NOLOGIN ${attributes};`,
    `CREATE ROLE vaylet_management_writer LOGIN PASSWORD '${identity.managementSecret}' ${attributes};`,
    `CREATE ROLE valet LOGIN PASSWORD '${identity.migratorSecret}' NOSUPERUSER NOINHERIT CREATEDB CREATEROLE NOREPLICATION NOBYPASSRLS;`,
    "GRANT vap1_proof_owner, vaylet_staff_session_lock_owner, vaylet_management_writer TO valet WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;",
    `CREATE ROLE vaylet_rating_feedback_reader_owner NOLOGIN ${attributes};`,
    `CREATE ROLE vaylet_rating_feedback_privacy_owner NOLOGIN ${attributes};`,
    `CREATE ROLE vaylet_rating_feedback_privacy_approver LOGIN PASSWORD NULL ${attributes};`,
    `CREATE ROLE vaylet_rating_feedback_privacy_executor LOGIN PASSWORD NULL ${attributes};`,
    "GRANT vaylet_rating_feedback_reader_owner, vaylet_rating_feedback_privacy_owner, vaylet_rating_feedback_privacy_approver, vaylet_rating_feedback_privacy_executor TO valet WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;",
    "SET ROLE valet;",
    "GRANT vaylet_rating_feedback_reader_owner, vaylet_rating_feedback_privacy_owner TO valet WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;",
    "RESET ROLE;",
    "ALTER DATABASE valet OWNER TO valet;",
  ];
  await ownedPsql(identity, bootstrap.join("\n"));
  for (const db of identity.databaseNames) {
    await ownedPsql(identity, `CREATE DATABASE ${db} OWNER valet;`);
    await ownedPsql(identity, [
      "ALTER SCHEMA public OWNER TO valet;",
      "REVOKE CREATE ON SCHEMA public FROM PUBLIC;",
    ].join("\n"), db);
  }
  // The migration service must never need the bootstrap superuser afterward.
  await ownedPsql(identity,
    "ALTER ROLE valet_ci_bootstrap NOLOGIN PASSWORD NULL;");
}
