import { randomUUID } from "node:crypto";

const id = () => randomUUID();
const digest = `hmac:v1:${"A".repeat(48)}`;

async function fails(client, sql, params, code) {
  let actual, detail;
  try { await client.query(sql, params); } catch (error) { actual = error.code; detail = error.message; }
  if (actual !== code) {
    throw new Error(`Expected PostgreSQL ${code}, received ${actual ?? "success"}: ${detail ?? ""}`);
  }
}

export async function runOutboundConstraintSmoke(client) {
  const org=id(), foreignOrg=id(), location=id(), user=id(), member=id();
  const vehicle=id(), customer=id(), visit=id();
  await client.query("INSERT INTO organizations(id,name,status,timezone,updated_at) VALUES($1,'Outbound Synthetic','ACTIVE','Asia/Amman',clock_timestamp())", [org]);
  await client.query("INSERT INTO organizations(id,name,status,timezone,updated_at) VALUES($1,'Foreign Synthetic','ACTIVE','Asia/Amman',clock_timestamp())", [foreignOrg]);
  await client.query(`INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,updated_at)
    VALUES($1,$2,'Outbound Test','WA-TEST','Synthetic','Asia/Amman','JOD',clock_timestamp())`,[location,org]);
  await client.query("INSERT INTO users(id,email,password_hash,status,updated_at) VALUES($1,$2,'hash','ACTIVE',clock_timestamp())",[user,`${user}@example.invalid`]);
  await client.query(`INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
    VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',clock_timestamp())`,[member,org,user]);
  await client.query("INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at) VALUES($1,$2,'Synthetic',clock_timestamp())",[vehicle,org]);
  await client.query("INSERT INTO customers(id,organization_id,phone_normalized,updated_at) VALUES($1,$2,'+15555550199',clock_timestamp())",[customer,org]);
  await client.query(`INSERT INTO valet_sessions(id,organization_id,location_id,vehicle_id,customer_id,
    customer_access_token_hash,customer_access_expires_at,customer_access_generation,
    state,checked_in_by_membership_id,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '1 day',1,
    'CHECKING_IN',$7,clock_timestamp())`,[visit,org,location,vehicle,customer,`sha256:v1:${"f".repeat(64)}`,member]);
  const binding=(await client.query(`INSERT INTO outbound_provider_bindings(
    organization_id,environment,waba_id,phone_number_id,config_alias,enabled,
    provider_verified_at,provider_evidence_reference)
    VALUES($1,'test','waba-synthetic','number-synthetic','sandbox',true,
      clock_timestamp(),'verified-test-account')
    RETURNING id`,[org])).rows[0].id;
  await client.query("INSERT INTO outbound_message_budgets(provider_binding_id) VALUES($1)",[binding]);
  const policy=(await client.query(`INSERT INTO outbound_messaging_policies(
    organization_id,purpose,enabled,language,provider_binding_id,template_catalog_version)
    VALUES($1,'INITIAL_GUEST_ACCESS',true,'en',$2,'test-template-v1') RETURNING id`,
    [org,binding])).rows[0].id;
  const inherited=(await client.query(`INSERT INTO outbound_messaging_policies(
    organization_id,location_id,purpose) VALUES($1,$2,'INITIAL_GUEST_ACCESS') RETURNING id`,
    [org,location])).rows[0].id;
  const permission=(await client.query(`SELECT outbound_permission_change(
    $1,$2,'synthetic-optin-proof',clock_timestamp()-interval '10 seconds',
    clock_timestamp()+interval '1 hour',0,'GRANT') AS id`,[org,digest])).rows[0].id;
  const intent=(await client.query(`INSERT INTO outbound_message_intents(
    organization_id,location_id,valet_session_id,customer_id,credential_generation,
    recipient_digest,permission_id,permission_revision,policy_id,policy_revision,company_policy_revision,
    provider_binding_id,binding_revision,template_catalog_version,language,expires_at)
    VALUES($1,$2,$3,$4,1,$5,$6,1,$7,1,1,$8,1,'test-template-v1','en',
      clock_timestamp()+interval '29 minutes') RETURNING id,expires_at`,
      [org,location,visit,customer,digest,permission,inherited,binding])).rows[0];
  await fails(client,`INSERT INTO outbound_message_intents(
    organization_id,location_id,valet_session_id,customer_id,credential_generation,
    recipient_digest,permission_id,permission_revision,policy_id,policy_revision,company_policy_revision,
    provider_binding_id,binding_revision,template_catalog_version,language,expires_at)
    VALUES($1,$2,$3,$4,1,$5,$6,1,$7,1,1,$8,1,'test-template-v1','en',
      clock_timestamp()+interval '29 minutes')`,
    [org,location,visit,customer,digest,permission,inherited,binding],"23505");
  await fails(client,`INSERT INTO outbound_message_deliveries(
    organization_id,intent_id,next_attempt_at) VALUES($1,$2,clock_timestamp())`,
    [foreignOrg,intent.id],"23503");
  const delivery=(await client.query(`INSERT INTO outbound_message_deliveries(
    organization_id,intent_id,next_attempt_at) VALUES($1,$2,clock_timestamp()) RETURNING id`,
    [org,intent.id])).rows[0].id;
  const aad=Buffer.from(JSON.stringify({
    version:1,organizationId:org,locationId:location,sessionId:visit,
    customerId:customer,intentId:intent.id,credentialGeneration:1,
    recipientDigest:digest,expiresAt:new Date(intent.expires_at).toISOString(),
  }));
  await client.query(`INSERT INTO outbound_message_envelopes(
    organization_id,intent_id,ciphertext,aad_label,key_version,purge_at)
    VALUES($1,$2,$3,$4,'test-rsa-key-v1',$5)`,
    [org,intent.id,Buffer.alloc(384,1),aad,intent.expires_at]);
  const disabled=await client.query("SELECT * FROM outbound_claim_due(10)");
  if (disabled.rows.length !== 0) throw new Error("Durable send OFF did not deny claim.");
  await client.query("UPDATE outbound_messaging_control SET send_enabled=true WHERE environment='test'");
  const leased=(await client.query("SELECT * FROM outbound_claim_due(10)")).rows;
  if (leased.length !== 1) throw new Error("Verified synthetic row was not leased.");
  const lease=leased[0];
  await fails(client,"SELECT * FROM outbound_dispatch_permit($1,$2,$3)",
    [delivery,lease.lease_token,`hmac:v1:${"B".repeat(48)}`],"P0001");
  const dispatched=(await client.query("SELECT * FROM outbound_dispatch_permit($1,$2,$3)",
    [delivery,lease.lease_token,digest])).rows[0];
  if (!dispatched || dispatched.ordinal !== 1 || !dispatched.ciphertext.equals(Buffer.alloc(384,1))) {
    throw new Error("Dispatch permit rejected valid synthetic inherited Location policy or AAD.");
  }
  const confirm=await client.query("SELECT outbound_confirm_dispatch($1,$2,$3,$4,$5) AS ok",
    [delivery,lease.lease_token,dispatched.attempt_id,digest,dispatched.phone_normalized]);
  if (confirm.rows[0]?.ok!==true) throw new Error("Post-permit confirm rejected fresh dispatch.");
  const changed=await client.query("SELECT outbound_confirm_dispatch($1,$2,$3,$4,$5) AS ok",
    [delivery,lease.lease_token,dispatched.attempt_id,digest,"+15555550000"]);
  if (changed.rows[0]?.ok!==false) throw new Error("Post-permit phone edit was accepted.");
  await client.query("UPDATE customers SET phone_normalized='+15555550000' WHERE id=$1",[customer]);
  const rotated=await client.query("SELECT outbound_confirm_dispatch($1,$2,$3,$4,$5) AS ok",
    [delivery,lease.lease_token,dispatched.attempt_id,digest,dispatched.phone_normalized]);
  if (rotated.rows[0]?.ok!==false) throw new Error("Canonical recipient change bypassed send fence.");
  await client.query("UPDATE customers SET phone_normalized='+15555550199' WHERE id=$1",[customer]);
  await client.query("UPDATE outbound_messaging_policies SET revision=revision+1 WHERE id=$1",[policy]);
  const stale=await client.query("SELECT outbound_confirm_dispatch($1,$2,$3,$4,$5) AS ok",
    [delivery,lease.lease_token,dispatched.attempt_id,digest,dispatched.phone_normalized]);
  if (stale.rows[0]?.ok!==false) throw new Error("Policy revision drift bypassed send fence.");
  const dedupe="a".repeat(64);
  const unknown=await client.query(
    "SELECT outbound_record_provider_event($1,$2,$3,$4,'DELIVERED',clock_timestamp(),$5,NULL) AS ok",
    [binding,dispatched.callback_handle,"wamid.synthetic",`hmac:v1:${"B".repeat(48)}`,dedupe]);
  if (unknown.rows[0].ok!==false) throw new Error("Wrong callback recipient was accepted.");
  for (let i=0;i<2;i++) {
    const event=await client.query(
      "SELECT outbound_record_provider_event($1,$2,$3,$4,'DELIVERED',clock_timestamp(),$5,NULL) AS ok",
      [binding,dispatched.callback_handle,"wamid.synthetic",digest,dedupe]);
    if (event.rows[0].ok!==true) throw new Error("Signed callback idempotency failed.");
  }
  const ended=await client.query(
    "SELECT outbound_finish_attempt($1,$2,$3,'ACCEPTED',$4,NULL) AS ok",
    [delivery,lease.lease_token,dispatched.attempt_id,"wamid.synthetic"]);
  if (ended.rows[0].ok!==true) throw new Error("Accepted attempt finalization failed.");
  const check=await client.query(`SELECT d.state,d.delivered_at,
    (SELECT count(*)::int FROM outbound_message_events WHERE delivery_id=$1) AS events,
    (SELECT count(*)::int FROM outbound_message_envelopes WHERE intent_id=$2) AS envelopes
    FROM outbound_message_deliveries d WHERE id=$1`,[delivery,intent.id]);
  const row=check.rows[0];
  if (row.state!=="ACCEPTED" || !row.delivered_at || row.events!==1 || row.envelopes!==0) {
    throw new Error("Callback-first acceptance, dedupe, or ciphertext purge failed.");
  }
  console.log("PASS: tenant FK, uniqueness, switch, consent, inherited policy permit, phone/revision fence, callback dedupe, purge.");
  return { org, location, customer, permission, policy, binding, digest, member };
}
