import { randomBytes, randomUUID } from "node:crypto";

async function makeDelivery(client, f, customer, kind) {
  const vehicle=randomUUID(),session=randomUUID();
  await client.query(`INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
    VALUES($1,$2,'Phone Drift Synthetic',clock_timestamp())`,[vehicle,f.org]);
  await client.query(`INSERT INTO valet_sessions(
    id,organization_id,location_id,vehicle_id,customer_id,
    customer_access_token_hash,customer_access_expires_at,customer_access_generation,
    state,checked_in_by_membership_id,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '1 day',1,
      'CHECKING_IN',$7,clock_timestamp())`,
  [session,f.org,f.location,vehicle,customer,
    `sha256:v1:${randomBytes(32).toString("hex")}`,f.member]);
  const intent=(await client.query(`INSERT INTO outbound_message_intents(
    organization_id,location_id,valet_session_id,customer_id,credential_generation,
    recipient_digest,permission_id,permission_revision,policy_id,policy_revision,
    company_policy_revision,provider_binding_id,binding_revision,
    template_catalog_version,language,expires_at)
    VALUES($1,$2,$3,$4,1,$5,$6,1,$7,2,2,$8,1,'test-template-v1','en',
      clock_timestamp()+interval '20 minutes') RETURNING id`,
  [f.org,f.location,session,customer,f.digest,f.permission,f.policy,f.binding])).rows[0].id;
  const inFlight=["LEASED","DISPATCHING"].includes(kind),dispatch=kind==="DISPATCHING";
  const delivery=(await client.query(`INSERT INTO outbound_message_deliveries(
    organization_id,intent_id,state,next_attempt_at,lease_token,lease_expires_at,attempt_count)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
  [f.org,intent,kind,inFlight?null:new Date(),inFlight?randomUUID():null,
    inFlight?new Date(Date.now()+120000):null,dispatch?1:0])).rows[0].id;
  if (dispatch) {
    await client.query(`INSERT INTO outbound_message_attempts(
      organization_id,delivery_id,provider_binding_id,ordinal)
      VALUES($1,$2,$3,1)`,[f.org,delivery,f.binding]);
  }
  await client.query(`INSERT INTO outbound_message_envelopes(
    organization_id,intent_id,ciphertext,aad_label,key_version,purge_at)
    VALUES($1,$2,$3,$4,'synthetic-key',clock_timestamp()+interval '20 minutes')`,
  [f.org,intent,Buffer.alloc(384,7),
    Buffer.from(JSON.stringify({synthetic:true,scenario:kind,session}))]);
  return {delivery,intent,kind};
}

async function assertCase(client,item,state,envelopes) {
  const {rows}=await client.query(`SELECT d.state,d.lease_token,d.next_attempt_at,
    (SELECT count(*)::int FROM outbound_message_envelopes e WHERE e.intent_id=$2)
      AS envelopes FROM outbound_message_deliveries d WHERE d.id=$1`,
  [item.delivery,item.intent]);
  if (rows[0]?.state!==state || rows[0]?.envelopes!==envelopes
    || (state==="SUPPRESSED" && (rows[0].lease_token!==null
      || rows[0].next_attempt_at!==null))) {
    throw new Error(`Phone drift ${item.kind} expected ${state}/${envelopes}: ${JSON.stringify(rows[0])}`);
  }
}

export async function runOutboundPhoneChangeSmoke(client, fixture) {
  const otherCustomer=randomUUID();
  await client.query(`INSERT INTO customers(
    id,organization_id,phone_normalized,updated_at)
    VALUES($1,$2,'+15555550266',clock_timestamp())`,[otherCustomer,fixture.org]);
  const target=[];
  for (const kind of ["PENDING","LEASED","RETRY_WAIT","DISPATCHING"]) {
    target.push(await makeDelivery(client,fixture,fixture.customer,kind));
  }
  const unaffected=await makeDelivery(client,fixture,otherCustomer,"PENDING");
  await client.query("BEGIN");
  try {
    await client.query(`UPDATE customers SET phone_normalized='+15555550977'
      WHERE id=$1`,[fixture.customer]);
    for (const item of target.slice(0,3)) {
      await assertCase(client,item,"SUPPRESSED",0);
    }
    await assertCase(client,target[3],"DISPATCHING",1);
  } finally {
    await client.query("ROLLBACK");
  }
  for (const item of target) await assertCase(client,item,item.kind,1);
  await client.query(`UPDATE customers SET phone_normalized=phone_normalized
    WHERE id=$1`,[fixture.customer]);
  for (const item of target) await assertCase(client,item,item.kind,1);
  await client.query(`UPDATE customers SET phone_normalized='+15555550977'
    WHERE id=$1`,[fixture.customer]);
  for (const item of target.slice(0,3)) {
    await assertCase(client,item,"SUPPRESSED",0);
  }
  await assertCase(client,target[3],"DISPATCHING",1);
  await assertCase(client,unaffected,"PENDING",1);
  await client.query(`UPDATE outbound_message_deliveries
    SET lease_expires_at=clock_timestamp()-interval '1 second'
    WHERE id=$1`,[target[3].delivery]);
  const {rows}=await client.query("SELECT outbound_recover_expired(10) AS recovered");
  if (rows[0]?.recovered!==1) throw new Error("Dispatched phone drift was not recovered.");
  await assertCase(client,target[3],"UNKNOWN",0);
  await assertCase(client,unaffected,"PENDING",1);
  // Leave no active synthetic outbox row for later consent-withdrawal tests.
  await client.query(`UPDATE customers SET phone_normalized='+15555550277'
    WHERE id=$1`,[otherCustomer]);
  await assertCase(client,unaffected,"SUPPRESSED",0);
  console.log("PASS: phone drift transactional rollback, no-op, 3 undispatched suppression/purge, in-flight UNKNOWN recovery, customer scope.");
}
