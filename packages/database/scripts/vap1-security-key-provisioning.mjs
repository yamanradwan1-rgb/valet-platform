// Synthetic-only fixture primitive; no CLI, no dotenv, no connection factory.
// The isolated Issue416 harness must attest all 3 URL targets BEFORE providing
// a dedicated disposable PG17 client. Never call against ordinary QA/live DBs.
const marker = /^issue416_[a-z0-9_]{3,50}$/;
const audiencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const keyPattern = /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/;

function assertSafeInputs({ audience, keyId, rootKey, targetDatabase }) {
  if (
    !marker.test(targetDatabase ?? "") ||
    !audiencePattern.test(audience ?? "") ||
    !keyPattern.test(keyId ?? "") ||
    !Buffer.isBuffer(rootKey) ||
    rootKey.length !== 32 ||
    process.env.NODE_ENV === "production"
  ) {
    throw new Error("VAP1 synthetic provisioner refused unsafe inputs.");
  }
}

export async function provisionSyntheticVap1Key(
  client,
  { audience, keyId, rootKey, targetDatabase, attestIsolatedPg17 },
) {
  assertSafeInputs({ audience, keyId, rootKey, targetDatabase });
  if (attestIsolatedPg17 !== true) {
    throw new Error("VAP1 requires independently attested isolated PG17 lease.");
  }
  const identity = await client.query(
    "SELECT current_database() AS db, current_setting('server_version_num')::integer AS version",
  );
  if (
    identity.rows[0]?.db !== targetDatabase ||
    identity.rows[0]?.version < 170000 ||
    identity.rows[0]?.version >= 180000
  ) {
    throw new Error("VAP1 synthetic target identity mismatch.");
  }
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE vap1_proof_owner");
    const boundary = await client.query(
      "SELECT phase,deployment_audience FROM auth_proof_private.security_boundary WHERE singleton FOR UPDATE",
    );
    if (boundary.rows[0]?.phase !== "LEGACY_COMPAT") {
      throw new Error("Synthetic key fixture cannot modify protected boundary.");
    }
    if (boundary.rows[0].deployment_audience !== null &&
        boundary.rows[0].deployment_audience !== audience) {
      throw new Error("Synthetic key fixture refuses a different deployment audience.");
    }
    if (boundary.rows[0].deployment_audience === null) {
      await client.query(
        "UPDATE auth_proof_private.security_boundary SET deployment_audience=$1 WHERE singleton AND phase='LEGACY_COMPAT'",
        [audience],
      );
    }
    await client.query(
      "SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1,0))",
      [`vap1-key:${audience}`],
    );
    const existing = await client.query(
      "SELECT promotion_epoch, key_id FROM auth_proof_private.key_selection WHERE audience=$1 FOR UPDATE",
      [audience],
    );
    if (existing.rowCount !== 0) {
      throw new Error("Synthetic key fixture refuses existing key/rotation.");
    }
    await client.query(
      `INSERT INTO auth_proof_private.proof_keys(
         audience,key_id,root_key,promotion_epoch,disposition
       ) VALUES($1,$2,$3::bytea,1,'ACTIVE_SIGNING')`,
      [audience, keyId, rootKey],
    );
    await client.query(
      `INSERT INTO auth_proof_private.key_selection(
         audience,key_id,promotion_epoch
       ) VALUES($1,$2,1)`,
      [audience, keyId],
    );
    await client.query("COMMIT");
    return { audience, keyId, promotionEpoch: 1 };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    rootKey.fill(0);
  }
}
