// Real ACL negatives require an explicitly attested, dedicated PG17 database.
import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyMfaProtectedWriterPrivileges } from "../scripts/mfa-protected-writer-verification.mjs";

const enabled = process.env.OPTION_C_MFA_ACL_PG17_TEST === "1";
const ownerUrl = process.env.OPTION_C_MFA_ACL_OWNER_URL;
const runtimeUrl = process.env.OPTION_C_MFA_ACL_RUNTIME_URL;
const writerUrl = process.env.OPTION_C_MFA_ACL_WRITER_URL;
const database = "option_c_mfa_acl_20261116";
const port = "45588";

function attestUrl(raw, role) {
  if (!raw) throw new Error("Missing explicit isolated MFA ACL PG17 URL.");
  const url = new URL(raw);
  assert.equal(url.protocol, "postgresql:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, port);
  assert.equal(url.pathname, `/${database}`);
  assert.equal(url.username, role);
  return url;
}

async function denied(client, sql) {
  await assert.rejects(client.query(sql), (error) => error.code === "42501");
}

test(
  "isolated PG17 MFA writer cannot read password hashes or exceed its exact SQL inventory",
  {
    skip: !enabled,
  },
  async () => {
    const ownerIdentity = attestUrl(ownerUrl, "option_c_mfa_acl_owner");
    const runtimeIdentity = attestUrl(runtimeUrl, "option_c_mfa_acl_runtime");
    const writerIdentity = attestUrl(writerUrl, "vaylet_mfa_writer");
    assert.equal(runtimeIdentity.host, ownerIdentity.host);
    assert.equal(writerIdentity.host, ownerIdentity.host);
    assert.equal(runtimeIdentity.pathname, ownerIdentity.pathname);
    assert.equal(writerIdentity.pathname, ownerIdentity.pathname);
    assert.notEqual(runtimeIdentity.username, writerIdentity.username);
    assert.notEqual(runtimeIdentity.password, writerIdentity.password);
    const { default: pg } = await import("pg");
    const owner = new pg.Client({ connectionString: ownerUrl });
    const runtime = new pg.Client({ connectionString: runtimeUrl });
    const writer = new pg.Client({ connectionString: writerUrl });
    await owner.connect();
    await runtime.connect();
    await writer.connect();
    try {
      const identity = await owner.query(
        `SELECT current_database() AS database,current_user AS principal,
              current_setting('server_version_num')::int AS version`,
      );
      assert.equal(identity.rows[0]?.database, database);
      assert.equal(identity.rows[0]?.principal, "option_c_mfa_acl_owner");
      assert.ok(identity.rows[0]?.version >= 170000);

      await verifyMfaProtectedWriterPrivileges(
        owner,
        "option_c_mfa_acl_runtime",
        "option_c_mfa_acl_owner",
      );
      const privileges = await owner.query(
        `SELECT has_table_privilege('vaylet_mfa_writer','public.users','SELECT') AS table_select,
              has_column_privilege('vaylet_mfa_writer','public.users','password_hash','SELECT') AS password_hash,
              has_column_privilege('vaylet_mfa_writer','public.users','email','SELECT') AS email,
              has_column_privilege('vaylet_mfa_writer','public.users','id','SELECT') AS id,
              has_column_privilege('vaylet_mfa_writer','public.users','status','SELECT') AS status,
              has_column_privilege('vaylet_mfa_writer','public.users','last_login_at','UPDATE') AS last_login_update,
              has_column_privilege('vaylet_mfa_writer','public.users','runtime_lock_version','UPDATE') AS runtime_lock_update,
              has_column_privilege('vaylet_mfa_writer','public.users','runtime_lock_version','SELECT') AS runtime_lock_select,
              has_column_privilege('vaylet_mfa_writer','public.staff_auth_sessions','current_access_token_hash','SELECT') AS token_hash_select,
              has_column_privilege('vaylet_mfa_writer','public.staff_auth_sessions','revoked_at','UPDATE') AS revoked_update`,
      );
      assert.deepEqual(privileges.rows[0], {
        table_select: false,
        password_hash: false,
        email: false,
        id: true,
        status: true,
        last_login_update: false,
        runtime_lock_update: true,
        runtime_lock_select: false,
        token_hash_select: true,
        revoked_update: false,
      });
      const functionAccess = await owner.query(
        `SELECT has_function_privilege('vaylet_mfa_writer',
                'public.s04_mfa_success(uuid,text,text)','EXECUTE') AS quota,
              has_function_privilege('vaylet_mfa_writer',
                'public.append_runtime_account_security_audit_event(uuid,text,uuid,public.account_security_actor_type,uuid,timestamp with time zone)',
                'EXECUTE') AS audit,
              has_function_privilege('vaylet_mfa_writer',
                'mfa_activity_private.touch_admin_activity(uuid,uuid,text,uuid,integer,text,bigint,bytea)',
                'EXECUTE') AS activity`,
      );
      assert.deepEqual(functionAccess.rows[0], {
        quota: true,
        audit: true,
        activity: false,
      });

      await writer.query("SELECT id,status FROM public.users WHERE false");
      await writer.query(
        `SELECT session.id,staff_user.status
       FROM public.staff_auth_sessions AS session
       JOIN public.users AS staff_user ON staff_user.id=session.user_id
       WHERE false
       FOR UPDATE OF session,staff_user`,
      );
      await denied(
        writer,
        "SELECT password_hash FROM public.users WHERE false",
      );
      await denied(writer, "SELECT email FROM public.users WHERE false");
      await denied(
        writer,
        "SELECT runtime_lock_version FROM public.users WHERE false",
      );
      await denied(writer, "SELECT * FROM public.users WHERE false");
      await denied(
        writer,
        "UPDATE public.users SET last_login_at=clock_timestamp() WHERE false",
      );
      await denied(
        writer,
        "UPDATE public.users SET password_hash='invalid' WHERE false",
      );
      await denied(
        writer,
        "UPDATE public.users SET status='DISABLED' WHERE false",
      );
      await denied(
        writer,
        "SELECT * FROM public.anti_abuse_events WHERE false",
      );
      await denied(
        writer,
        "SELECT mfa_activity_private.touch_admin_activity(NULL::uuid,NULL::uuid,NULL::text,NULL::uuid,NULL::integer,NULL::text,NULL::bigint,NULL::bytea)",
      );
      await denied(
        writer,
        "UPDATE public.organization_memberships SET role='ORG_ADMIN' WHERE false",
      );
      await denied(
        writer,
        "UPDATE public.staff_auth_sessions SET revoked_at=clock_timestamp() WHERE false",
      );
      await denied(writer, "SELECT public.mfa_totp_factor_guard()");
    } finally {
      await Promise.all([writer.end(), runtime.end(), owner.end()]);
    }
  },
);
