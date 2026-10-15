import { randomBytes, randomUUID } from "node:crypto";

async function crashDispatch(client, fixture, kind) {
  const { org, location, customer, permission, policy, binding, digest, member }=fixture;
  const vehicle=randomUUID(),session=randomUUID(),lease=randomUUID();
  await client.query(`INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
    VALUES($1,$2,'Signed Crash Recovery Synthetic',clock_timestamp())`,[vehicle,org]);
  await client.query(`INSERT INTO valet_sessions(
    id,organization_id,location_id,vehicle_id,customer_id,
    customer_access_token_hash,customer_access_expires_at,customer_access_generation,
    state,checked_in_by_membership_id,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '1 day',1,
      'CHECKING_IN',$7,clock_timestamp())`,
  [session,org,location,vehicle,customer,`sha256:v1:${randomBytes(32).toString("hex")}`,member]);
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
  const attempt=(await client.query(`INSERT INTO outbound_message_attempts(
    organization_id,delivery_id,provider_binding_id,ordinal)
    VALUES($1,$2,$3,1) RETURNING id,callback_handle`,
  [org,delivery,binding])).rows[0];
  await client.query(`INSERT INTO outbound_message_envelopes(
    organization_id,intent_id,ciphertext,aad_label,key_version,purge_at)
    VALUES($1,$2,$3,$4,'test-rsa-key-v1',clock_timestamp()+interval '20 minutes')`,
  [org,intent,Buffer.alloc(384,4),Buffer.from(JSON.stringify({synthetic:true,kind}))]);
  if (["SENT","DELIVERED","READ","FAILED"].includes(kind)) {
    const result=await client.query(`SELECT outbound_record_provider_event(
      $1,$2,$3,$4,$5,clock_timestamp(),$6,NULL) AS ok`,
    [binding,attempt.callback_handle,`wamid.crash.${randomUUID()}`,digest,kind,
      randomBytes(32).toString("hex")]);
    if (result.rows[0]?.ok!==true) throw new Error(`Signed ${kind} fixture callback rejected.`);
  } else if (kind==="FORGED_TIMESTAMP") {
    // A delivery timestamp alone is mutable and is NOT authenticated callback proof.
    await client.query(`UPDATE outbound_message_deliveries
      SET delivered_at=clock_timestamp() WHERE id=$1`,[delivery]);
  } else if (kind==="BARE_MESSAGE_ID") {
    // A stored correlation identifier alone is not a signed provider event.
    await client.query(`UPDATE outbound_message_attempts
      SET provider_message_id=$1 WHERE id=$2`,[`wamid.unverified.${randomUUID()}`,attempt.id]);
  }
  const before=(await client.query(`SELECT state,accepted_at FROM outbound_message_deliveries
    WHERE id=$1`,[delivery])).rows[0];
  if (before?.state!=="DISPATCHING" || before.accepted_at!==null) {
    throw new Error(`Crash window fixture ${kind} is not dispatching before recovery.`);
  }
  return { kind,delivery,intent,attempt:attempt.id };
}

export async function runOutboundCallbackCrashSmoke(client, fixture, senderRole) {
  const scenarios=[];
  for (const kind of ["SENT","DELIVERED","READ","FAILED","FORGED_TIMESTAMP",
    "BARE_MESSAGE_ID","ABSENT"]) {
    scenarios.push(await crashDispatch(client,fixture,kind));
  }
  await client.query(`SET ROLE "${senderRole}"`);
  let recovered;
  try {
    recovered=await client.query("SELECT outbound_recover_expired(10) AS count");
  } finally {
    await client.query("RESET ROLE");
  }
  if (recovered.rows[0]?.count!==scenarios.length) {
    throw new Error("Signed callback crash recovery count mismatch.");
  }
  for (const {kind,delivery,intent,attempt} of scenarios) {
    const result=await client.query(`SELECT d.state,d.accepted_at,d.terminal_reason,
      d.lease_token,d.lease_expires_at,d.next_attempt_at,d.sent_at,d.delivered_at,d.read_at,
      a.state AS attempt_state,
      (SELECT count(*)::int FROM outbound_message_envelopes e WHERE e.intent_id=$2) AS envelopes,
      (SELECT count(*)::int FROM outbound_message_events e WHERE e.attempt_id=$3
        AND e.event_kind IN ('SENT','DELIVERED','READ')) AS authenticated
      FROM outbound_message_deliveries d JOIN outbound_message_attempts a
        ON a.delivery_id=d.id AND a.id=$3 WHERE d.id=$1`,[delivery,intent,attempt]);
    const r=result.rows[0], trusted=["SENT","DELIVERED","READ"].includes(kind);
    if (!r || r.state!==(trusted?"ACCEPTED":"UNKNOWN")
      || r.attempt_state!==(trusted?"ACCEPTED":"UNKNOWN") || r.envelopes!==0
      || r.lease_token!==null || r.lease_expires_at!==null || r.next_attempt_at!==null
      || Boolean(r.accepted_at)!==trusted || r.terminal_reason!==(trusted?null:"UNKNOWN")
      || r.authenticated!==(trusted?1:0)
      || (kind==="SENT" && !r.sent_at)
      || (kind==="DELIVERED" && !r.delivered_at)
      || (kind==="READ" && !r.read_at)) {
      throw new Error(`Signed ${kind} crash recovery lost trusted proof or safety: ${JSON.stringify(r)}`);
    }
    if (kind==="FORGED_TIMESTAMP" && !r.delivered_at) {
      throw new Error("Negative forged timestamp fixture was not exercised.");
    }
  }
  await client.query(`SET ROLE "${senderRole}"`);
  let repeat;
  try {
    repeat=await client.query("SELECT outbound_recover_expired(10) AS count");
  } finally {
    await client.query("RESET ROLE");
  }
  if (repeat.rows[0]?.count!==0) throw new Error("Terminal crash recovery was not idempotent.");
  const queued=await client.query("SELECT * FROM outbound_claim_due(10)");
  if (scenarios.some((scenario)=>queued.rows.some((row)=>row.delivery_id===scenario.delivery))) {
    throw new Error("Recovered crash scenario became eligible for replay.");
  }
  console.log("PASS: signed SENT/DELIVERED/READ callback crash -> ACCEPTED; FAILED/forged timestamp/bare ID/no proof -> UNKNOWN; purge, no resend, idempotent.");
}
