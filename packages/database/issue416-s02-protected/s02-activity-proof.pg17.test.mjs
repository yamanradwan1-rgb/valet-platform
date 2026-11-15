// Dedicated W33 synthetic PG17 test: exact same-XID signed admin activity,
// wrong MAC, nonce replay, foreign backend, stale proof and revoked session.
import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";

const enabled = process.env.ISSUE416_W33_S02_PG17_TEST === "1";
const ownerUrl = process.env.ISSUE416_W33_S02_OWNER_URL;
const runtimeUrl = process.env.DATABASE_URL;
const root = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 41));

const call = (client, input, mac) => client.query(
  `SELECT mfa_activity_private.touch_admin_activity(
     $1::uuid,$2::uuid,$3::text,$4::uuid,$5::integer,
     $6::text,$7::bigint,$8::bytea) AS applied`,
  [input.session, input.user, input.hash, input.nonce, input.pid,
    input.xid, input.ms, mac],
);

function proof(input) {
  return createHmac("sha256", root).update([
    "MFA_ADMIN_ACTIVITY/v1", "issue416_w33_s02_fresh2",
    input.session, input.user, input.hash, input.nonce,
    String(input.pid), input.xid, String(input.ms),
  ].join("|")).digest();
}

async function metadata(client) {
  const result = await client.query(
    `SELECT pg_backend_pid() AS pid,pg_current_xact_id()::text AS xid,
         trunc(EXTRACT(epoch FROM clock_timestamp())*1000)::text AS ms`,
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0];
}

test("one-use activity proof cannot be replayed, forwarded or minted by SQL-only role", {
  skip: !enabled,
}, async () => {
  for (const raw of [ownerUrl, runtimeUrl]) {
    assert.ok(raw, "Explicit isolated W33 PG URL required");
    const target = new URL(raw);
    assert.equal(target.hostname, "127.0.0.1");
    assert.equal(target.port, "45533");
    assert.equal(target.pathname, "/issue416_w33_s02_fresh2");
  }
  const owner = new pg.Client({ connectionString: ownerUrl });
  const trusted = new pg.Client({ connectionString: runtimeUrl });
  const foreign = new pg.Client({ connectionString: runtimeUrl });
  await owner.connect();
  await trusted.connect();
  await foreign.connect();
  const user = randomUUID();
  const session = randomUUID();
  const factor = randomUUID();
  const hash = "staff-access-sha256:v1:" + createHash("sha256")
    .update(randomUUID()).digest("hex");
  try {
    await owner.query(
      `INSERT INTO users(id,email,password_hash,status,updated_at)
       VALUES ($1,$2,'synthetic-not-real-password','ACTIVE',clock_timestamp())`,
      [user, user + "@w33-s02-proof.test"],
    );
    await owner.query(
      `INSERT INTO user_mfa_totp_factors(
         id,user_id,state,protected_secret,last_accepted_step,
         recovery_set_generation,created_at,activated_at)
       VALUES (
         $1,$2,'ACTIVE',$3,120,1,
         clock_timestamp()-INTERVAL '3 minutes',
         clock_timestamp()-INTERVAL '2 minutes')`,
      [factor, user, "mte1." + "A".repeat(16) + "." +
        "B".repeat(43) + "." + "C".repeat(22)],
    );
    await owner.query(
      `INSERT INTO staff_auth_sessions(
         id,user_id,current_access_token_hash,created_at,last_rotated_at,
         access_expires_at,absolute_expires_at,mfa_authenticated_at,
         mfa_factor_id,last_admin_activity_at)
       VALUES (
         $1,$2,$3,clock_timestamp()-INTERVAL '1 minute',
         clock_timestamp()-INTERVAL '1 minute',
         clock_timestamp()+INTERVAL '14 minutes',
         clock_timestamp()+INTERVAL '720 hours',
         clock_timestamp()-INTERVAL '30 seconds',$4,
         clock_timestamp()-INTERVAL '10 seconds')`,
      [session, user, hash, factor],
    );
    const before = await owner.query(
      "SELECT last_admin_activity_at FROM staff_auth_sessions WHERE id=$1",
      [session],
    );
    await trusted.query("BEGIN");
    const info = await metadata(trusted);
    const input = {
      session, user, hash, nonce:randomUUID(), pid:info.pid,
      xid:info.xid, ms:info.ms,
    };
    const validMac = proof(input);
    await trusted.query("SAVEPOINT wrong_mac");
    await assert.rejects(call(trusted, input, Buffer.alloc(32)), {
      code: "42501",
    });
    await trusted.query("ROLLBACK TO SAVEPOINT wrong_mac");
    await trusted.query("SAVEPOINT wrong_pid");
    await assert.rejects(call(trusted, { ...input, pid:input.pid + 1 },
      proof({ ...input, pid:input.pid + 1 })), { code:"42501" });
    await trusted.query("ROLLBACK TO SAVEPOINT wrong_pid");
    const accepted = await call(trusted, input, validMac);
    assert.equal(accepted.rows[0]?.applied, 1);
    await trusted.query("SAVEPOINT replay");
    await assert.rejects(call(trusted, input, validMac), {
      code: "42501",
    });
    await trusted.query("ROLLBACK TO SAVEPOINT replay");
    await trusted.query("COMMIT");

    const after = await owner.query(
      `SELECT last_admin_activity_at,mfa_authenticated_at
       FROM staff_auth_sessions WHERE id=$1`,
      [session],
    );
    assert.ok(after.rows[0].last_admin_activity_at >
      before.rows[0].last_admin_activity_at);
    assert.ok(after.rows[0].mfa_authenticated_at instanceof Date);
    await assert.rejects(call(foreign, input, validMac), {
      code:"42501",
    });
    const stale = { ...input, nonce:randomUUID(),
      ms: String(BigInt(input.ms)-10000n) };
    await assert.rejects(call(foreign, stale, proof(stale)), {
      code:"42501",
    });
    await assert.rejects(call(trusted, input, validMac), {
      code:"42501",
    });
    await owner.query(
      "UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1",
      [session],
    );
    await trusted.query("BEGIN");
    const revokedInfo = await metadata(trusted);
    const revoked = { session,user,hash,nonce:randomUUID(),
      ...{ pid:revokedInfo.pid,xid:revokedInfo.xid,ms:revokedInfo.ms } };
    await assert.rejects(call(trusted, revoked, proof(revoked)), {
      code:"42501",
    });
    await trusted.query("ROLLBACK");
  } finally {
    await foreign.end();
    await trusted.end();
    await owner.end();
  }
});
