import { randomUUID } from "node:crypto";

export async function runOutboundOptoutSmoke(client, fixture) {
  const { org,location,customer,permission,policy,binding,digest,member }=fixture;
  const vehicle=randomUUID(), session=randomUUID();
  await client.query(`INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
    VALUES($1,$2,'Optout Synthetic',clock_timestamp())`,[vehicle,org]);
  await client.query(`INSERT INTO valet_sessions(
    id,organization_id,location_id,vehicle_id,customer_id,customer_access_token_hash,
    customer_access_expires_at,customer_access_generation,state,
    checked_in_by_membership_id,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '1 day',1,
    'CHECKING_IN',$7,clock_timestamp())`,
    [session,org,location,vehicle,customer,`sha256:v1:${"8".repeat(64)}`,member]);
  const intent=(await client.query(`INSERT INTO outbound_message_intents(
    organization_id,location_id,valet_session_id,customer_id,credential_generation,
    recipient_digest,permission_id,permission_revision,policy_id,policy_revision,
    company_policy_revision,provider_binding_id,binding_revision,
    template_catalog_version,language,expires_at)
    VALUES($1,$2,$3,$4,1,$5,$6,1,$7,2,2,$8,1,'test-template-v1','en',
    clock_timestamp()+interval '20 minutes') RETURNING id`,
    [org,location,session,customer,digest,permission,policy,binding])).rows[0].id;
  const delivery=(await client.query(`INSERT INTO outbound_message_deliveries(
    organization_id,intent_id,state,next_attempt_at)
    VALUES($1,$2,'PENDING',clock_timestamp()+interval '10 minutes') RETURNING id`,
    [org,intent])).rows[0].id;
  await client.query(`INSERT INTO outbound_message_envelopes(
    organization_id,intent_id,ciphertext,aad_label,key_version,purge_at)
    VALUES($1,$2,$3,$4,'test-rsa-key-v1',clock_timestamp()+interval '20 minutes')`,
    [org,intent,Buffer.alloc(384,5),Buffer.from(JSON.stringify({synthetic:true,purpose:'optout-suppression'}))]);
  await client.query(`SELECT outbound_permission_change(
    $1,$2,'synthetic-withdrawn-proof',NULL,NULL,1,'WITHDRAW')`,[org,digest]);
  const removed=await client.query("SELECT outbound_recover_expired(10) AS count");
  const record=await client.query(`SELECT d.state,d.next_attempt_at,
    (SELECT count(*)::int FROM outbound_message_envelopes WHERE intent_id=$2) AS envelopes
    FROM outbound_message_deliveries d WHERE d.id=$1`,[delivery,intent]);
  if (removed.rows[0]?.count!==1 || record.rows[0]?.state!=="SUPPRESSED"
    || record.rows[0]?.next_attempt_at!==null || record.rows[0]?.envelopes!==0) {
    throw new Error("Consent withdrawal did not promptly suppress pending delivery/purge envelope.");
  }
  const due=await client.query("SELECT * FROM outbound_claim_due(10)");
  if (due.rows.some((row)=>row.delivery_id===delivery)) {
    throw new Error("Withdrawn delivery became dispatch-eligible.");
  }
  console.log("PASS: revoked consent suppresses PENDING delivery and purges ciphertext.");
}
