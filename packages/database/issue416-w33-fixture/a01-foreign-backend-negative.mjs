// A committed but unconsumed challenge must never cross its originating
// backend/fullXid, even when the foreign caller knows a genuine valid HMAC.
import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";

const uuidSql = (value) => "'" + value + "'::uuid";
const hexSql = (value) => "decode('" + value + "','hex')";
const sha = (value) => createHash("sha256").update(value).digest("hex");

export async function assertForeignBackendDenied({
  createSession, userId, storedPhc, key, identifierHash, fingerprint,
}) {
  const operation = randomUUID();
  const reservation = randomUUID();
  const sessionId = randomUUID();
  const refreshId = randomUUID();
  const args = [
    "'w33-test'",uuidSql(operation),uuidSql(userId),hexSql(sha(storedPhc)),
    uuidSql(sessionId),uuidSql(refreshId),
    "'staff-access-sha256:v1:" + sha(sessionId) + "'",
    "'staff-refresh-sha256:v1:" + sha(refreshId) + "'",
    uuidSql(reservation),hexSql(fingerprint),
  ].join(",");
  const binder = createSession();
  try {
    await binder.query(`INSERT INTO public.anti_abuse_events(
      id,scope,key_hash,state
    ) VALUES (${uuidSql(reservation)},'v1:staff-login-identifier',
      '${identifierHash}','PENDING')`);
    await binder.query(`BEGIN; SET ROLE vap1_proof_owner;
      SELECT auth_proof_private.a01_bind_limiter(
        'w33-test',${uuidSql(operation)},${uuidSql(reservation)},
        ${hexSql(fingerprint)},'${identifierHash}');
      COMMIT`);
  } finally { binder.close(); }
  const preparing = createSession();
  let challengeId, proofHex, payloadHex, stateHex, firstPid, firstXid;
  try {
    await preparing.query("BEGIN; SET ROLE vap1_proof_owner");
    [challengeId, proofHex, payloadHex, stateHex, firstPid, firstXid] =
      (await preparing.query(`SELECT challenge_id,encode(proof_bytes,'hex'),
        encode(payload_bytes,'hex'),encode(state_bytes,'hex'),
        backend_pid,full_xid
        FROM auth_proof_private.a01_prepare(${args})`)).split("|");
    assert.equal(challengeId?.length,36);
    await preparing.query("COMMIT");
  } finally { preparing.close(); }
  const mac = createHmac("sha256",key)
    .update(Buffer.from(proofHex,"hex")).digest("hex");
  const foreign = createSession();
  try {
    await foreign.query("SET ROLE vap1_proof_owner");
    const foreignPid = await foreign.query("SELECT pg_backend_pid()");
    assert.notEqual(foreignPid,firstPid);
    const rejected = await foreign.query(`DO $w33_foreign$ BEGIN
      PERFORM auth_proof_private.consume_verified_challenge(
        ${uuidSql(challengeId)},${hexSql(proofHex)},${hexSql(mac)},
        ${hexSql(sha(Buffer.from(payloadHex,"hex")))},
        ${hexSql(sha(Buffer.from(stateHex,"hex")))});
      RAISE EXCEPTION 'FOREIGN_BACKEND_PROOF_ACCEPTED';
    EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
    END $w33_foreign$`);
    assert.equal(rejected,"");
    const unchanged = await foreign.query(`SELECT
      (SELECT consumed_at IS NULL FROM auth_proof_private.proof_challenges
        WHERE challenge_id=${uuidSql(challengeId)}),
      (SELECT count(*) FROM public.staff_auth_sessions
        WHERE id=${uuidSql(sessionId)}),
      (SELECT count(*) FROM auth_proof_private.operation_receipts
        WHERE operation_id=${uuidSql(operation)})`);
    assert.equal(unchanged,"t|0|0");
    assert.ok(BigInt(firstXid)>0n);
  } finally { foreign.close(); }
}
