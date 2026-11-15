// Actual SQL-role negatives only on W33's exclusively owned disposable PG17.
import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";

const enabled = process.env.ISSUE416_W33_S02_PG17_TEST === "1";
const ownerUrl = process.env.ISSUE416_W33_S02_OWNER_URL;
const runtimeUrl = process.env.DATABASE_URL;
const writerUrl = process.env.MFA_WRITER_DATABASE_URL;

function attestUrl(raw, role) {
  if (!raw) throw new Error("Missing isolated W33 S02 URL.");
  const url = new URL(raw);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "45533");
  assert.equal(url.pathname, "/issue416_w33_s02_fresh2");
  assert.equal(url.username, role);
}

const forbidden = [
  "UPDATE staff_auth_sessions SET mfa_authenticated_at=clock_timestamp() WHERE false",
  "UPDATE staff_auth_sessions SET mfa_factor_id=NULL WHERE false",
  "UPDATE staff_auth_sessions SET last_admin_activity_at=clock_timestamp() WHERE false",
  "INSERT INTO user_mfa_totp_factors(id,user_id,protected_secret) VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','mte1.invalid')",
  "UPDATE user_mfa_totp_factors SET state='ACTIVE' WHERE false",
  "UPDATE user_mfa_totp_factors SET last_accepted_step=1 WHERE false",
  "INSERT INTO mfa_recovery_codes(id,factor_id,set_generation,slot,selector,verifier) VALUES ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001',1,1,'selector001','mrv1.invalid')",
  "UPDATE mfa_recovery_codes SET consumed_at=clock_timestamp() WHERE false",
];

test("isolated PG17 runtime cannot forge MFA origin, factor or privileged idle", {
  skip: !enabled,
}, async () => {
  attestUrl(ownerUrl, "issue416_w33_s02_owner");
  attestUrl(runtimeUrl, "issue416_w33_s02_runtime");
  attestUrl(writerUrl, "vaylet_mfa_writer");
  const owner = new pg.Client({ connectionString: ownerUrl });
  const runtime = new pg.Client({ connectionString: runtimeUrl });
  const writer = new pg.Client({ connectionString: writerUrl });
  await owner.connect();
  await runtime.connect();
  await writer.connect();
  try {
    const facts = await owner.query(
      `SELECT
         pg_has_role('issue416_w33_s02_runtime',
           'vaylet_mfa_writer','MEMBER') AS is_member,
         has_column_privilege('issue416_w33_s02_runtime',
           'staff_auth_sessions','mfa_authenticated_at','UPDATE') AS can_assure,
         has_column_privilege('issue416_w33_s02_runtime',
           'staff_auth_sessions','last_admin_activity_at','UPDATE') AS can_touch,
         has_column_privilege('issue416_w33_s02_runtime',
           'user_mfa_totp_factors','state','UPDATE') AS can_activate,
         has_column_privilege('vaylet_mfa_writer',
           'staff_auth_sessions','mfa_authenticated_at','UPDATE') AS writer_can_assure,
         has_column_privilege('vaylet_mfa_writer',
           'user_mfa_totp_factors','state','UPDATE') AS writer_can_activate`,
    );
    assert.deepEqual(facts.rows[0], {
      is_member: false, can_assure: false, can_touch: false,
      can_activate: false, writer_can_assure: true, writer_can_activate: true,
    });
    const identity = await owner.query(
      `SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolbypassrls
       FROM pg_catalog.pg_roles
       WHERE rolname IN ('issue416_w33_s02_runtime','vaylet_mfa_writer')
       ORDER BY rolname`,
    );
    assert.equal(identity.rowCount, 2);
    assert.ok(identity.rows.every((row) =>
      row.rolcanlogin && !row.rolinherit && !row.rolsuper && !row.rolbypassrls));
    for (const sql of forbidden) {
      await assert.rejects(runtime.query(sql), { code: "42501" });
    }
    await assert.rejects(
      writer.query("UPDATE users SET password_hash='x' WHERE false"),
      { code: "42501" },
    );
    await assert.rejects(
      writer.query("UPDATE organization_memberships SET role='ORG_ADMIN' WHERE false"),
      { code: "42501" },
    );
    await assert.rejects(
      writer.query("UPDATE anti_abuse_events SET state='IGNORED' WHERE false"),
      { code: "42501" },
    );
    await assert.rejects(
      runtime.query("SELECT secret FROM mfa_activity_private.key_root"),
      { code: "42501" },
    );
    await assert.rejects(
      writer.query("SELECT secret FROM mfa_activity_private.key_root"),
      { code: "42501" },
    );
    const ledger = await owner.query(
      "SELECT count(*)::int AS applied FROM _prisma_migrations WHERE finished_at IS NOT NULL",
    );
    assert.equal(ledger.rows[0]?.applied, 141);
  } finally {
    await writer.end();
    await runtime.end();
    await owner.end();
  }
});
