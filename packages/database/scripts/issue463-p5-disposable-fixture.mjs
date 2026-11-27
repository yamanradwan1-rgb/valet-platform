import assert from "node:assert/strict";
import { createHash, randomUUID, randomBytes } from "node:crypto";

export const makeId = () => randomUUID();
export function credentials() {
  const ca = "vsa1." + randomBytes(32).toString("base64url");
  const lm = "vsa1." + randomBytes(32).toString("base64url");
  const expiredLm = "vsa1." + randomBytes(32).toString("base64url");
  return { ca, lm, expiredLm };
}
const verifier = (raw) =>
  "staff-access-sha256:v1:" + createHash("sha256").update(raw).digest("hex");
export async function seedFeedbackReaderFixture(migration) {
  const ids = {
    org: makeId(), foreignOrg: makeId(), active: makeId(), historical: makeId(),
    foreignLoc: makeId(), caUser: makeId(), lmUser: makeId(), factor: makeId(),
    caMember: makeId(), lmMember: makeId(), caSession: makeId(),
    lmSession: makeId(), expiredSession: makeId(),
    visits: Array.from({ length: 6 }, makeId),
  };
  const tokens = credentials();
  const created = "2026-11-01T00:00:00Z";
  const date = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const period = date.toISOString().slice(0, 10);
  const completed = date.toISOString();
  const query = (sql, params=[]) => migration.query(sql, params);
  await query("INSERT INTO public.organizations(id,name,status,timezone,updated_at) VALUES($1,'P5 test organization','ACTIVE','UTC',clock_timestamp()),($2,'Foreign P5 test','ACTIVE','UTC',clock_timestamp())", [ids.org,ids.foreignOrg]);
  for (const [loc,org,status] of [
    [ids.active,ids.org,"ACTIVE"],
    [ids.historical,ids.org,"INACTIVE"],
    [ids.foreignLoc,ids.foreignOrg,"ACTIVE"],
  ]) {
    await query(`INSERT INTO public.locations(id,organization_id,name,code,address_text,timezone,currency,status,updated_at)
      VALUES($1,$2,$3,$4,'Test Only','UTC','JOD',$5,clock_timestamp())`,
      [loc,org,"P5-"+loc.slice(0,8),loc.slice(0,8),status]);
  }
  await query(`INSERT INTO public.organization_subscriptions
    (organization_id,plan_code,status,dashboard_access_enabled,report_exports_enabled,basic_branding_enabled)
    VALUES($1,'TEST','ACTIVE',true,false,false)`,[ids.org]);
  for (const user of [ids.caUser,ids.lmUser]) {
    await query(`INSERT INTO public.users(id,email,password_hash,status,updated_at)
      VALUES($1,$2,'synthetic-test-only','ACTIVE',clock_timestamp())`,
      [user,"p5-"+user+"@example.invalid"]);
  }
  await query(`INSERT INTO public.organization_memberships
    (id,organization_id,user_id,role,status,updated_at)
    VALUES($1,$3,$4,'ORG_ADMIN','ACTIVE',clock_timestamp()),
          ($2,$3,$5,'LOCATION_MANAGER','ACTIVE',clock_timestamp())`,
    [ids.caMember,ids.lmMember,ids.org,ids.caUser,ids.lmUser]);
  await query(`INSERT INTO public.membership_location_access
    (organization_id,membership_id,location_id) VALUES($1,$2,$3)`,
    [ids.org,ids.lmMember,ids.active]);
  await query(`INSERT INTO public.user_mfa_totp_factors
    (id,user_id,state,protected_secret,activated_at,last_accepted_step,recovery_set_generation)
    VALUES($1,$2,'ACTIVE',$3,clock_timestamp(),0,1)`,
    [ids.factor,ids.caUser,"mte1."+"A".repeat(16)+"."+"B".repeat(24)+"."+"C".repeat(22)]);
  await query(`INSERT INTO public.staff_auth_sessions
     (id,user_id,current_access_token_hash,access_expires_at,absolute_expires_at,
      created_at,last_rotated_at,mfa_authenticated_at,mfa_factor_id,last_admin_activity_at)
     VALUES($1,$2,$3,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',
       $4,clock_timestamp(),clock_timestamp()-interval '1 minute',$5,clock_timestamp()-interval '1 minute')`,
    [ids.caSession,ids.caUser,verifier(tokens.ca),created,ids.factor]);
  await query(`INSERT INTO public.staff_auth_sessions
     (id,user_id,current_access_token_hash,access_expires_at,absolute_expires_at,
      created_at,last_rotated_at,mfa_authenticated_at,mfa_factor_id,last_admin_activity_at)
     VALUES($1,$2,$3,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',
       $4,clock_timestamp(),NULL,NULL,NULL)`,
    [ids.lmSession,ids.lmUser,verifier(tokens.lm),created]);
  await query(`INSERT INTO public.staff_auth_sessions
     (id,user_id,current_access_token_hash,access_expires_at,absolute_expires_at,
      created_at,last_rotated_at,mfa_authenticated_at,mfa_factor_id,last_admin_activity_at)
     VALUES($1,$2,$3,clock_timestamp()-interval '1 second',clock_timestamp()+interval '2 hours',
       $4,clock_timestamp()-interval '1 minute',NULL,NULL,NULL)`,
    [ids.expiredSession,ids.lmUser,verifier(tokens.expiredLm),created]);
  for (const location of [ids.active,ids.historical]) {
    await query(`INSERT INTO public.guest_location_privacy
      (organization_id,location_id) VALUES($1,$2)`,[ids.org,location]);
    await query(`INSERT INTO public.guest_privacy_publications
      (organization_id,location_id,version,en_text,ar_text)
      VALUES($1,$2,1,'Synthetic English notice','إشعار تجريبي')`,
      [ids.org,location]);
    await query(`UPDATE public.guest_location_privacy SET published_version=1
      WHERE organization_id=$1 AND location_id=$2`,[ids.org,location]);
    await query(`INSERT INTO public.guest_rating_comment_notice_approvals
      (organization_id,location_id,published_version,approval_case_id,approved_at,approver_ref)
      VALUES($1,$2,1,$3,clock_timestamp(),'test-fixture-only')`,
      [ids.org,location,randomUUID()]);
  }
  const entries = [
    {rating:5,state:"PRESENT",comment:"P5_VISIBLE_A",location:ids.active},
    {rating:4,state:"HELD",comment:"P5_HELD_SECRET",location:ids.active},
    {rating:3,state:"ERASED",comment:null,location:ids.active},
    {rating:2,state:"PRESENT",comment:"P5_EXPIRED_SECRET",location:ids.historical,expired:true},
    {rating:1,state:null,comment:null,location:ids.active},
    {rating:null,state:null,comment:null,location:ids.active},
  ];
  for (let i=0; i<entries.length; i++) {
    const visit=ids.visits[i], entry=entries[i];
    const vehicle=randomUUID();
    await query(`INSERT INTO public.vehicles(id,organization_id,temporary_descriptor,updated_at)
      VALUES($1,$2,'P5 test',clock_timestamp())`,[vehicle,ids.org]);
    await query(`INSERT INTO public.valet_sessions
      (id,organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,
       customer_access_token_hash,customer_access_expires_at,completed_at,updated_at)
      VALUES($1,$2,$3,$4,'COMPLETED',$5,
       public.guest_browser_hash_secret($7::text),clock_timestamp()+interval '1 hour',
       $6,clock_timestamp())`,
      [visit,ids.org,entry.location,vehicle,ids.lmMember,completed,
        randomBytes(32).toString("base64url")]);
    if (entry.rating === null) continue;
    await query(`INSERT INTO public.guest_ratings
      (organization_id,location_id,valet_session_id,rating,rated_at)
      VALUES($1,$2,$3,$4,$5)`,
      [ids.org,entry.location,visit,entry.rating,
       new Date(date.valueOf()+(entries.length-i)*1000).toISOString()]);
    if (entry.state === null) continue;
    await query(`INSERT INTO public.guest_rating_comments
      (organization_id,location_id,valet_session_id,comment_text,state,
       retention_expires_at,notice_version,hold_case_id,erased_at)
      VALUES($1,$2,$3,$4,$5,
        CASE WHEN $6 THEN clock_timestamp()-interval '1 hour'
             ELSE clock_timestamp()+interval '1 day' END,1,$7,$8)`,
      [ids.org,entry.location,visit,entry.comment,entry.state,entry.expired===true,
       entry.state==="HELD"?randomUUID():null,
       entry.state==="ERASED"?new Date():null]);
  }
  const ca=[ids.caSession,ids.caUser,tokens.ca,created,ids.caMember,ids.org,null,period,period];
  const lm=[ids.lmSession,ids.lmUser,tokens.lm,created,ids.lmMember,ids.org,ids.active,period,period];
  const expiredLm=[ids.expiredSession,ids.lmUser,tokens.expiredLm,created,
    ids.lmMember,ids.org,ids.active,period,period];
  assert.equal(ids.visits.length,6);
  return { ids,ca,lm,expiredLm,period,entries };
}
