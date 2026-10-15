import { randomUUID } from "node:crypto";

async function expectsDenied(client, sql, params, label) {
  let code;
  try { await client.query(sql, params); } catch (error) { code=error.code; }
  if (code!=="42501") {
    throw new Error(`API role ${label}: expected PostgreSQL 42501; received ${code ?? "INSERT SUCCESS"}`);
  }
}

export async function runOutboundBindingInsertSmoke(client, runtime, organizationId) {
  const id=randomUUID();
  const safeColumns=`id,organization_id,purpose,provider,environment,waba_id,phone_number_id,config_alias`;
  const safeValues=`$1,$2,'INITIAL_GUEST_ACCESS','META_CLOUD','production','waba-onboarding',
    'phone-onboarding','unverified-sandbox'`;
  await client.query(`SET ROLE "${runtime}"`);
  try {
    // W7 P1 regression: a compromised API runtime cannot self-attest Meta ownership.
    await expectsDenied(client,`INSERT INTO outbound_provider_bindings(
      ${safeColumns},enabled,provider_verified_at,provider_evidence_reference)
      VALUES(${safeValues},true,clock_timestamp(),'fake-verified-proof')`,
    [randomUUID(),organizationId],"forged verified/enabled INSERT");
    for (const [column, value] of [
      ["enabled","false"],
      ["provider_verified_at","NULL"],
      ["provider_evidence_reference","NULL"],
      ["revision","1"],
      ["created_at","clock_timestamp()"],
      ["updated_at","clock_timestamp()"],
    ]) {
      await expectsDenied(client,`INSERT INTO outbound_provider_bindings(
        ${safeColumns},${column}) VALUES(${safeValues},${value})`,
      [randomUUID(),organizationId],`explicit ${column} INSERT`);
    }
    const inserted=await client.query(`INSERT INTO outbound_provider_bindings(${safeColumns})
      VALUES(${safeValues}) RETURNING id,enabled,provider_verified_at,provider_evidence_reference,
        revision,created_at,updated_at`,[id,organizationId]);
    const row=inserted.rows[0];
    if (row?.id!==id || row.enabled!==false || row.provider_verified_at!==null
      || row.provider_evidence_reference!==null || row.revision!==1
      || !row.created_at || !row.updated_at) {
      throw new Error("Safe API provider onboarding did not preserve secure defaults.");
    }
    await expectsDenied(client,`UPDATE outbound_provider_bindings
      SET provider_verified_at=clock_timestamp(),provider_evidence_reference='fake-verified-proof'
      WHERE id=$1`,[id],"operator-only verification UPDATE");
    const updated=await client.query(`UPDATE outbound_provider_bindings
      SET config_alias='unverified-sandbox-v2',revision=revision+1,
        updated_at=clock_timestamp() WHERE id=$1 RETURNING revision`,[id]);
    if (updated.rows[0]?.revision!==2) {
      throw new Error("Legitimate API binding configuration revision was denied.");
    }
  } finally {
    await client.query("RESET ROLE");
  }
  console.log("PASS: API Meta binding forged/explicit verification, enable, version and timestamp INSERT 42501; safe disabled onboarding and scoped edit PASS.");
}
