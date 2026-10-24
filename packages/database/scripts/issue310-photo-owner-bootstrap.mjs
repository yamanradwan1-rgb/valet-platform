import pg from "pg";

/** One-time Issue310 fresh-cluster handoff for the protected photo function. */
const connection = process.env.MIGRATION_DATABASE_URL;
const parsed = connection ? new URL(connection) : null;
if (process.env.NODE_ENV !== "test" ||
    process.env.OUTBOUND_MESSAGING_SEND_ENABLED !== "false" ||
    parsed?.hostname !== "127.0.0.1" || parsed.port !== "56310" ||
    parsed.pathname !== "/vaylet_wa310" ||
    decodeURIComponent(parsed.username) !== "wa310_bootstrap") {
  throw new Error("Photo-owner handoff refuses any database outside Issue310.");
}
const client = new pg.Client({ connectionString: connection });
try {
  await client.connect();
  const { rows } = await client.query(`
    SELECT n.nspname, p.proname, pg_get_userbyid(p.proowner) AS owner,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='condition_photo_lock_management_evidence'`);
  if (rows.length !== 1 ||
      !["wa310_migrate", "wa310_bootstrap", "valet_photo_evidence_lock_owner"].includes(rows[0].owner) ||
      rows[0].args !== "p_photo_id uuid, p_organization_id uuid, p_location_id uuid, p_session_id uuid, p_operation_id uuid, p_attempt_id uuid, p_actor_membership_id uuid, p_object_key text, p_sha256 bytea, p_byte_size integer, p_bucket_alias text, p_object_version text") {
    throw new Error("Unexpected protected photo function; stop provisioning.");
  }
  if (rows[0].owner === "wa310_migrate") {
    await client.query(`ALTER FUNCTION public.condition_photo_lock_management_evidence(
      uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea,integer,text,text
    ) OWNER TO wa310_bootstrap`);
    console.log("Transferred only the Issue310 protected photo function for one-time API provisioning.");
  } else {
    console.log("Issue310 protected photo function already has controlled provisioning ownership.");
  }
} finally {
  await client.end();
}
