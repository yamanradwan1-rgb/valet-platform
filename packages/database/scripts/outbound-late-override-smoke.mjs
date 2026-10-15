import { randomUUID } from "node:crypto";

export async function runOutboundLateOverrideSmoke(client, fixture) {
  const { org, customer, permission, policy, binding, digest, member }=fixture;
  const location=randomUUID(),vehicle=randomUUID(),session=randomUUID();
  await client.query(`INSERT INTO locations(id,organization_id,name,code,address_text,
    timezone,currency,updated_at) VALUES($1,$2,'Late Override',$3,
    'Synthetic','Asia/Amman','JOD',clock_timestamp())`,
    [location,org,`WA-LATE-${location.slice(0,6)}`]);
  await client.query(`INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
    VALUES($1,$2,'Late Override Synthetic',clock_timestamp())`,[vehicle,org]);
  await client.query(`INSERT INTO valet_sessions(
    id,organization_id,location_id,vehicle_id,customer_id,
    customer_access_token_hash,customer_access_expires_at,customer_access_generation,
    state,checked_in_by_membership_id,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '1 day',1,
      'CHECKING_IN',$7,clock_timestamp())`,
    [session,org,location,vehicle,customer,`sha256:v1:${"d".repeat(64)}`,member]);
  const intent=(await client.query(`INSERT INTO outbound_message_intents(
    organization_id,location_id,valet_session_id,customer_id,credential_generation,
    recipient_digest,permission_id,permission_revision,policy_id,policy_revision,
    company_policy_revision,provider_binding_id,binding_revision,
    template_catalog_version,language,expires_at)
    VALUES($1,$2,$3,$4,1,$5,$6,1,$7,2,2,$8,1,'test-template-v1','en',
      clock_timestamp()+interval '20 minutes') RETURNING id`,
    [org,location,session,customer,digest,permission,policy,binding])).rows[0].id;
  const delivery=(await client.query(`INSERT INTO outbound_message_deliveries(
    organization_id,intent_id,next_attempt_at) VALUES($1,$2,clock_timestamp())
    RETURNING id`,[org,intent])).rows[0].id;
  const claimed=(await client.query("SELECT * FROM outbound_claim_due(10)")).rows;
  const lease=claimed.find((row)=>row.delivery_id===delivery);
  if (!lease) throw new Error("Fresh company-only intent was not leased.");
  await client.query(`INSERT INTO outbound_messaging_policies(
    organization_id,location_id,purpose,enabled)
    VALUES($1,$2,'INITIAL_GUEST_ACCESS',false)`,[org,location]);
  let code;
  try {
    await client.query("SELECT * FROM outbound_dispatch_permit($1,$2,$3)",
      [delivery,lease.lease_token,digest]);
  } catch (error) { code=error.code; }
  if (code!=="P0001") throw new Error("Late Location override did not revoke prior company policy intent.");
  await client.query(`UPDATE outbound_message_deliveries SET state='SUPPRESSED',
    lease_token=NULL,lease_expires_at=NULL,next_attempt_at=NULL WHERE id=$1`,[delivery]);
  console.log("PASS: Location override inserted after company-only issuance suppresses send.");
}
