import { randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { Client } from "pg";
import { hashGuestAccessToken } from "../src/modules/valet-sessions/guest-access-command";
import type { acquireIssue463BrowserTarget } from "./issue463-browser-target";

type Target = Awaited<ReturnType<typeof acquireIssue463BrowserTarget>>;

export async function seedIssue463Browser(target: Target) {
  const { client } = target;
  const organizationId = randomUUID();
  const locationId = randomUUID();
  const membershipId = randomUUID();
  const userId = randomUUID();
  const email = `${userId}@issue463.test`;
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await client.query("BEGIN");
  try {
    await client.query(`INSERT INTO organizations(id,name,status,timezone,updated_at)
      VALUES ($1,'Issue463 synthetic org','ACTIVE','Asia/Amman',clock_timestamp())`, [organizationId]);
    await client.query(`INSERT INTO organization_subscriptions
      (organization_id,plan_code,status,dashboard_access_enabled,report_exports_enabled,basic_branding_enabled)
      VALUES ($1,'TEST_ENTITLED','ACTIVE',TRUE,TRUE,TRUE)`, [organizationId]);
    await client.query(`INSERT INTO locations
      (id,organization_id,name,code,address_text,timezone,currency,status,accepting_intake,updated_at)
      VALUES ($1,$2,'Issue463 synthetic location',$3,'Synthetic','Asia/Amman','JOD','ACTIVE',TRUE,clock_timestamp())`,
    [locationId,organizationId,locationId]);
    await client.query(`INSERT INTO users(id,email,password_hash,status,updated_at)
      VALUES ($1,$2,$3,'ACTIVE',clock_timestamp())`, [userId,email,passwordHash]);
    await client.query(`INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
      VALUES ($1,$2,$3,'LOCATION_MANAGER','ACTIVE',clock_timestamp())`, [membershipId,organizationId,userId]);
    await client.query(`INSERT INTO membership_location_access(organization_id,membership_id,location_id)
      VALUES ($1,$2,$3)`, [organizationId,membershipId,locationId]);
    await client.query(`INSERT INTO guest_location_privacy(organization_id,location_id,revision)
      VALUES ($1,$2,1)`, [organizationId,locationId]);
    await client.query(`INSERT INTO guest_privacy_publications(organization_id,location_id,version,en_text,ar_text)
      VALUES ($1,$2,1,$3,$4)`, [organizationId,locationId,"Synthetic privacy notice, not for production.",
      "\u0625\u0634\u0639\u0627\u0631 \u062e\u0635\u0648\u0635\u064a\u0629 \u062a\u062c\u0631\u064a\u0628\u064a"]);
    await client.query(`UPDATE guest_location_privacy SET published_version=1
      WHERE organization_id=$1 AND location_id=$2`, [organizationId,locationId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  const approver = new Client({ connectionString: target.approverUrl });
  try {
    await approver.connect();
    const result = await approver.query<{ outcome: string }>(
      "SELECT public.approve_guest_rating_comment_notice($1::uuid,$2::uuid,1,$3::uuid) AS outcome",
      [organizationId,locationId,randomUUID()]);
    if (result.rows[0]?.outcome !== "APPROVED") throw new Error("Synthetic notice approval rejected.");
  } finally { await approver.end(); }

  async function completedVisit() {
    const id = randomUUID();
    const vehicleId = randomUUID();
    const token = randomBytes(32).toString("base64url");
    await client.query(`INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
      VALUES ($1,$2,'Synthetic test vehicle',clock_timestamp())`, [vehicleId,organizationId]);
    await client.query(`INSERT INTO valet_sessions(id,customer_access_token_hash,customer_access_expires_at,
      organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,completed_at,created_at,updated_at)
      VALUES ($1,$2,clock_timestamp()+interval '1 hour',$3,$4,$5,'COMPLETED',$6,
      clock_timestamp()-interval '10 seconds',clock_timestamp()-interval '2 minutes',clock_timestamp())`,
    [id,hashGuestAccessToken(token),organizationId,locationId,vehicleId,membershipId]);
    return { id, token };
  }
  return { organizationId, locationId, email, password, completedVisit };
}
