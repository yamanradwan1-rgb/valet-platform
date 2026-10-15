import { randomUUID } from "node:crypto";

export async function runOutboundLateCallbackSmoke(client, fixture) {
  const { org, location, customer, permission, policy, binding, digest, member }=fixture;
  const vehicle=randomUUID(),session=randomUUID();
  await client.query(`INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
    VALUES($1,$2,'Delayed Callback Synthetic',clock_timestamp())`,[vehicle,org]);
  await client.query(`INSERT INTO valet_sessions(
    id,organization_id,location_id,vehicle_id,customer_id,
    customer_access_token_hash,customer_access_expires_at,customer_access_generation,
    state,checked_in_by_membership_id,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '1 day',1,
      'CHECKING_IN',$7,clock_timestamp())`,
    [session,org,location,vehicle,customer,`sha256:v1:${"c".repeat(64)}`,member]);
  const intent=(await client.query(`INSERT INTO outbound_message_intents(
    organization_id,location_id,valet_session_id,customer_id,credential_generation,
    recipient_digest,permission_id,permission_revision,policy_id,policy_revision,
    company_policy_revision,provider_binding_id,binding_revision,
    template_catalog_version,language,expires_at)
    VALUES($1,$2,$3,$4,1,$5,$6,1,$7,2,2,$8,1,'test-template-v1','en',
      clock_timestamp()+interval '20 minutes') RETURNING id`,
    [org,location,session,customer,digest,permission,policy,binding])).rows[0].id;
  const delivery=(await client.query(`INSERT INTO outbound_message_deliveries(
    organization_id,intent_id,state,next_attempt_at,attempt_count)
    VALUES($1,$2,'RETRY_WAIT',clock_timestamp()+interval '2 minutes',1)
    RETURNING id`,[org,intent])).rows[0].id;
  const callback=(await client.query(`INSERT INTO outbound_message_attempts(
    organization_id,delivery_id,provider_binding_id,ordinal,state)
    VALUES($1,$2,$3,1,'NOT_SENT') RETURNING callback_handle`,
    [org,delivery,binding])).rows[0].callback_handle;
  await client.query(`INSERT INTO outbound_message_envelopes(
    organization_id,intent_id,ciphertext,aad_label,key_version,purge_at)
    VALUES($1,$2,$3,$4,'test-rsa-key-v1',clock_timestamp()+interval '20 minutes')`,
    [org,intent,Buffer.alloc(384,3),Buffer.from(JSON.stringify({synthetic:true,purpose:"delayed-callback"}))]);
  const event=await client.query(
    "SELECT outbound_record_provider_event($1,$2,'wamid.late',$3,'SENT',clock_timestamp(),$4,NULL) AS ok",
    [binding,callback,digest,"b".repeat(64)]);
  if (event.rows[0]?.ok!==true) throw new Error("Delayed signed SENT callback was rejected.");
  const result=await client.query(`SELECT d.state,d.next_attempt_at,
    (SELECT count(*)::int FROM outbound_message_envelopes WHERE intent_id=$2) AS envelopes
    FROM outbound_message_deliveries d WHERE d.id=$1`,[delivery,intent]);
  const row=result.rows[0];
  if (row?.state!=="ACCEPTED" || row?.next_attempt_at!==null || row?.envelopes!==0) {
    throw new Error("Delayed signed callback failed to cancel scheduled retry/purge envelope.");
  }
  const claimed=await client.query("SELECT * FROM outbound_claim_due(10)");
  if (claimed.rows.some((item)=>item.delivery_id===delivery)) {
    throw new Error("Signed delayed callback left message eligible for another send.");
  }
  console.log("PASS: callback after NOT_SENT/RETRY_WAIT cancels resend and purges ciphertext.");
}
