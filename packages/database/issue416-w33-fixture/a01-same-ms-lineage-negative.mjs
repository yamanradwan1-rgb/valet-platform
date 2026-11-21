// Reproduce the original 143 false-COMMITTED: independent staff credentials
// from the same user with the exact same millisecond as the genuine audit.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

const sqlUuid = (value) => "'" + value + "'::uuid";
const sha = (value) => createHash("sha256").update(value).digest("hex");

export async function assertSameMillisecondLineage({
  createSession, audience, operationId, userId, originalSessionId, reservationId,
}) {
  const decoySession = randomUUID();
  const decoyRefresh = randomUUID();
  const decoyAccessHash = "staff-access-sha256:v1:" + sha(decoySession);
  const decoyRefreshHash = "staff-refresh-sha256:v1:" + sha(decoyRefresh);
  const db = createSession();
  try {
    await db.query(`INSERT INTO public.staff_auth_sessions(
      id,user_id,current_access_token_hash,access_expires_at,
      absolute_expires_at,created_at,last_rotated_at
    ) SELECT ${sqlUuid(decoySession)},user_id,'${decoyAccessHash}',
      access_expires_at,absolute_expires_at,created_at,last_rotated_at
    FROM public.staff_auth_sessions WHERE id=${sqlUuid(originalSessionId)}`);
    await db.query(`INSERT INTO public.staff_refresh_credentials(
      id,session_id,token_hash,generation,created_at,expires_at
    ) SELECT ${sqlUuid(decoyRefresh)},${sqlUuid(decoySession)},
      '${decoyRefreshHash}',generation,created_at,expires_at
    FROM public.staff_refresh_credentials
    WHERE session_id=${sqlUuid(originalSessionId)} AND generation=1`);
    const equalTimestamps = await db.query(`SELECT
      (SELECT created_at FROM public.staff_auth_sessions
        WHERE id=${sqlUuid(originalSessionId)}) =
      (SELECT created_at FROM public.staff_auth_sessions
        WHERE id=${sqlUuid(decoySession)})`);
    assert.equal(equalTimestamps,"t");
    await db.query("SET ROLE vap1_proof_owner");
    const status = await db.query(`SELECT receipt_status
      FROM auth_proof_private.a01_read_commit_receipt(
        '${audience}',${sqlUuid(operationId)},${sqlUuid(userId)},
        ${sqlUuid(decoySession)},${sqlUuid(decoyRefresh)},
        ${sqlUuid(reservationId)},'${decoyAccessHash}',
        '${decoyRefreshHash}')`);
    const expected = process.env.W33_EXPECT_VULNERABLE === "1"
      ? "COMMITTED" : "UNKNOWN";
    assert.equal(status,expected,
      "An unrelated same-ms tuple must not match original signed payload");
    if (process.env.W33_EXPECT_VULNERABLE !== "1") {
      const acl = await db.query(`SELECT
        has_table_privilege('issue416_w33_runtime',
          'auth_proof_private.a01_original_lineage','SELECT'),
        has_table_privilege('issue416_w33_runtime',
          'auth_proof_private.a01_original_lineage','INSERT'),
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_class c
          CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
            c.relacl,pg_catalog.acldefault('r',c.relowner))) a
          WHERE c.oid='auth_proof_private.a01_original_lineage'::regclass
            AND a.grantee=0)`);
      assert.equal(acl,"f|f|f");
      const immutable = await db.query(`DO $w33_immutable$ BEGIN
        UPDATE auth_proof_private.a01_original_lineage
          SET verified_phc_digest=decode(repeat('00',32),'hex')
          WHERE operation_id=${sqlUuid(operationId)};
        RAISE EXCEPTION 'UNEXPECTED_LINEAGE_UPDATE_ALLOWED';
      EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
      END $w33_immutable$`);
      assert.equal(immutable,"");
      const removal = await db.query(`DO $w33_remove$ BEGIN
        DELETE FROM auth_proof_private.a01_original_lineage
          WHERE operation_id=${sqlUuid(operationId)};
        RAISE EXCEPTION 'UNEXPECTED_LINEAGE_DELETE_ALLOWED';
      EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
      END $w33_remove$`);
      assert.equal(removal,"");
      const replayInsert = await db.query(`DO $w33_insert$ BEGIN
        INSERT INTO auth_proof_private.a01_original_lineage(
          challenge_id,audience,operation_id,user_id,
          verified_phc_digest,session_id,refresh_id,
          access_hash,refresh_hash,reservation_id)
        SELECT challenge_id,audience,operation_id,user_id,
          verified_phc_digest,session_id,refresh_id,
          access_hash,refresh_hash,reservation_id
        FROM auth_proof_private.a01_original_lineage
        WHERE operation_id=${sqlUuid(operationId)};
        RAISE EXCEPTION 'UNEXPECTED_LINEAGE_FORGERY_ALLOWED';
      EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
      END $w33_insert$`);
      assert.equal(replayInsert,"");
    }
  } finally { db.close(); }
}
