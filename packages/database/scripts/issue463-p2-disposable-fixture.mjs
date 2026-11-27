import { createHash } from "node:crypto";

// Fixed IDs and credential values belong exclusively to the attested synthetic
// P7 fixture. No rating, child, approval, or disposition outcome is preseeded.
export async function seedP2Fixture(m) {
  const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
  const org=id(101),loc=id(201),user=id(301),member=id(401),factor=id(601);
  await m.query("BEGIN");
  try {
    await m.query(`INSERT INTO organizations(id,name,status,timezone,updated_at)
      VALUES($1,'Issue463 SQL test','ACTIVE','UTC',clock_timestamp())`,[org]);
    await m.query(`INSERT INTO organization_subscriptions
      (organization_id,plan_code,status,dashboard_access_enabled,report_exports_enabled,basic_branding_enabled)
      VALUES($1,'TEST','ACTIVE',true,false,false)`,[org]);
    await m.query(`INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,status,updated_at)
      VALUES($1,$2,'Issue463 SQL location','P2','Synthetic','UTC','JOD','ACTIVE',clock_timestamp())`,[loc,org]);
    await m.query(`INSERT INTO users(id,email,password_hash,status,updated_at)
      VALUES($1,'p2-synthetic@example.invalid','synthetic-test-only','ACTIVE',clock_timestamp())`,[user]);
    await m.query(`INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
      VALUES($1,$2,$3,'ORG_ADMIN','ACTIVE',clock_timestamp())`,[member,org,user]);
    await m.query(`INSERT INTO user_mfa_totp_factors
      (id,user_id,state,protected_secret,activated_at,last_accepted_step,recovery_set_generation)
      VALUES($1,$2,'ACTIVE',$3,clock_timestamp(),0,1)`,
      [factor,user,"mte1."+"A".repeat(16)+"."+"B".repeat(24)+"."+"C".repeat(22)]);
    const token="vsa1."+"A".repeat(43);
    const hash="staff-access-sha256:v1:"+createHash("sha256").update(token).digest("hex");
    await m.query(`INSERT INTO staff_auth_sessions
      (id,user_id,current_access_token_hash,access_expires_at,absolute_expires_at,
       created_at,last_rotated_at,mfa_authenticated_at,mfa_factor_id,last_admin_activity_at)
      VALUES($1,$2,$3,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',
       '2026-01-01T00:00:00Z',clock_timestamp(),clock_timestamp()-interval '1 minute',$4,clock_timestamp()-interval '1 minute')`,
      [id(501),user,hash,factor]);
    await m.query(`INSERT INTO guest_location_privacy(organization_id,location_id,revision) VALUES($1,$2,1)`,[org,loc]);
    await m.query(`INSERT INTO guest_privacy_publications(organization_id,location_id,version,en_text,ar_text)
      VALUES($1,$2,1,'Synthetic English privacy notice',$3)`,[org,loc,"\u0625\u0634\u0639\u0627\u0631 \u062a\u062c\u0631\u064a\u0628\u064a"]);
    await m.query(`UPDATE guest_location_privacy SET published_version=1 WHERE organization_id=$1 AND location_id=$2`,[org,loc]);
    for(let i=0;i<6;i++){
      const vehicle=id(901+i),visit=id(701+i);
      await m.query(`INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
        VALUES($1,$2,'Synthetic test vehicle',clock_timestamp())`,[vehicle,org]);
      await m.query(`INSERT INTO valet_sessions
        (id,organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,
         customer_access_token_hash,customer_access_expires_at,customer_access_generation,completed_at,created_at,updated_at)
        VALUES($1,$2,$3,$4,'COMPLETED',$5,public.guest_browser_hash_secret($6),
         clock_timestamp()+interval '1 hour',1,clock_timestamp()-interval '1 minute',
         clock_timestamp()-interval '2 minutes',clock_timestamp())`,
        [visit,org,loc,vehicle,member,String.fromCharCode(65+i).repeat(43)]);
    }
    await m.query("COMMIT");
  }catch(error){await m.query("ROLLBACK");throw error;}
}
