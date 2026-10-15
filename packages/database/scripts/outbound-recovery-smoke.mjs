import { randomUUID } from "node:crypto";

export async function runOutboundRecoverySmoke(client, fixture) {
  const { org, location, customer, permission, policy, binding, digest, member } = fixture;
  const vehicle=randomUUID(), session=randomUUID(), lease=randomUUID();
  await client.query(
    "INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at) VALUES($1,$2,'Recovery Synthetic',clock_timestamp())",
    [vehicle,org],
  );
  await client.query(`INSERT INTO valet_sessions(
    id,organization_id,location_id,vehicle_id,customer_id,
    customer_access_token_hash,customer_access_expires_at,customer_access_generation,
    state,checked_in_by_membership_id,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '1 day',1,
    'CHECKING_IN',$7,clock_timestamp())`,
    [session,org,location,vehicle,customer,`sha256:v1:${"e".repeat(64)}`,member],
  );
  const intent=(await client.query(`INSERT INTO outbound_message_intents(
    organization_id,location_id,valet_session_id,customer_id,credential_generation,
    recipient_digest,permission_id,permission_revision,policy_id,policy_revision,
    company_policy_revision,provider_binding_id,binding_revision,
    template_catalog_version,language,expires_at)
    VALUES($1,$2,$3,$4,1,$5,$6,1,$7,2,2,$8,1,'test-template-v1','en',
      clock_timestamp()+interval '20 minutes') RETURNING id`,
    [org,location,session,customer,digest,permission,policy,binding])).rows[0].id;
  const delivery=(await client.query(`INSERT INTO outbound_message_deliveries(
    organization_id,intent_id,state,lease_token,lease_expires_at,attempt_count)
    VALUES($1,$2,'DISPATCHING',$3,clock_timestamp()-interval '1 minute',1)
    RETURNING id`,[org,intent,lease])).rows[0].id;
  await client.query(`INSERT INTO outbound_message_attempts(
    organization_id,delivery_id,provider_binding_id,ordinal)
    VALUES($1,$2,$3,1)`,[org,delivery,binding]);
  await client.query(`INSERT INTO outbound_message_envelopes(
    organization_id,intent_id,ciphertext,aad_label,key_version,purge_at)
    VALUES($1,$2,$3,$4,'test-rsa-key-v1',clock_timestamp()+interval '20 minutes')`,
    [org,intent,Buffer.alloc(384,2),Buffer.from(JSON.stringify({synthetic:true,purpose:"recovery-only"}))]);

  const cleaned=await client.query("SELECT outbound_recover_expired(10) AS count");
  if (cleaned.rows[0]?.count!==1) throw new Error("Stale in-flight dispatch recovery count mismatch.");
  const state=await client.query(`SELECT d.state,d.lease_token,
    (SELECT state FROM outbound_message_attempts WHERE delivery_id=$1) AS attempt_state,
    (SELECT count(*)::int FROM outbound_message_envelopes WHERE intent_id=$2) AS envelopes
    FROM outbound_message_deliveries d WHERE id=$1`,[delivery,intent]);
  const observed=state.rows[0];
  if (observed?.state!=="UNKNOWN" || observed?.lease_token!==null
    || observed?.attempt_state!=="UNKNOWN" || observed?.envelopes!==0) {
    throw new Error("Stale DISPATCHING recovery did not fence resend and purge ciphertext.");
  }
  const retry=await client.query("SELECT * FROM outbound_claim_due(10)");
  if (retry.rows.some((row) => row.delivery_id===delivery)) {
    throw new Error("UNKNOWN dispatch became eligible for automatic resend.");
  }
  console.log("PASS: stale DISPATCHING -> UNKNOWN, attempt fenced, envelope purged, no repeat claim.");
}
