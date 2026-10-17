import { randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";

/** Committed fixtures ONLY inside the explicitly guarded disposable G2 DB.
 * These are direct SQL test fixtures, never operational domain writer evidence.
 */
export async function seedIssue300Http(client, { indirectAudit = true } = {}) {
  const ids = Object.fromEntries([
    "org", "otherOrg", "location", "otherLocation", "foreignLocation",
    "vehicle", "foreignVehicle", "session", "foreignSession", "slot", "task",
    "audit", "custody", "dispatch", "incident", "metadataAudit",
    "badMetadataAudit", "vehicleMetadataAudit", "metadataActor", "metadataUser", "retrievalTask",
  ].map((key) => [key, randomUUID()]));
  const users = {};
  const now = () => new Date().toISOString();
  await client.query("BEGIN");
  try {
    for (const [org, title] of [[ids.org, "Task Issue300"], [ids.otherOrg, "Other tenant"]]) {
      await client.query(
        `INSERT INTO organizations(id,name,status,timezone,updated_at)
         VALUES($1,$2,'ACTIVE','Asia/Amman',now())`, [org, title],
      );
      await client.query(
        `INSERT INTO organization_subscriptions(organization_id,plan_code,status,
           dashboard_access_enabled,report_exports_enabled,basic_branding_enabled)
         VALUES($1,'G2_TEST','ACTIVE',true,true,true)`, [org],
      );
    }
    for (const [id, org, code] of [
      [ids.location, ids.org, "300A"],
      [ids.otherLocation, ids.org, "300B"],
      [ids.foreignLocation, ids.otherOrg, "300F"],
    ]) {
      await client.query(
        `INSERT INTO locations(id,organization_id,name,code,address_text,timezone,
           currency,status,updated_at)
         VALUES($1,$2,$4,$3,'Test only','Asia/Amman','JOD','ACTIVE',now())`,
        [id, org, code, code === "300A" ? "G2 A Location" :
          code === "300B" ? "G2 B Location" : "G2 Foreign Location"],
      );
    }
    for (const [key, role, org, location] of [
      ["admin", "ORG_ADMIN", ids.org, ids.location],
      ["manager", "LOCATION_MANAGER", ids.org, ids.location],
      ["supervisor", "VALET_SUPERVISOR", ids.org, ids.location],
      ["foreign", "ORG_ADMIN", ids.otherOrg, ids.foreignLocation],
    ]) {
      const id = randomUUID();
      const membershipId = randomUUID();
      const password = "T!300-" + randomBytes(24).toString("base64url");
      const email = `issue300-${id}@example.invalid`;
      const hash = await argon2.hash(password, {
        hashLength: 32, memoryCost: 65_536, parallelism: 4,
        salt: randomBytes(16), timeCost: 3, type: argon2.argon2id, version: 19,
      });
      await client.query(
        `INSERT INTO users(id,email,password_hash,status,updated_at)
         VALUES($1,$2,$3,'ACTIVE',now())`, [id, email, hash],
      );
      await client.query(
        `INSERT INTO organization_memberships(id,organization_id,user_id,
           role,status,first_name,last_name,updated_at)
         VALUES($1,$2,$3,$4,'ACTIVE','Issue300',$5,now())`,
        [membershipId, org, id, role, key],
      );
      await client.query(
        `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
         VALUES($1,$2,$3)`, [org, membershipId, location],
      );
      users[key] = { id, membershipId, email, password };
    }
    for (const [vehicle, org] of [[ids.vehicle, ids.org], [ids.foreignVehicle, ids.otherOrg]]) {
      await client.query(
        `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
         VALUES($1,$2,'G2 ONLY',now())`, [vehicle, org],
      );
    }
    for (const [session, org, loc, vehicle, member] of [
      [ids.session, ids.org, ids.location, ids.vehicle, users.admin.membershipId],
      [ids.foreignSession, ids.otherOrg, ids.foreignLocation,
        ids.foreignVehicle, users.foreign.membershipId],
    ]) {
      await client.query(
        `INSERT INTO valet_sessions(id,organization_id,location_id,vehicle_id,state,
           checked_in_by_membership_id,customer_access_token_hash,
           customer_access_expires_at,updated_at)
         VALUES($1,$2,$3,$4,'PARKED',$5,$6,now()+interval '1 day',now())`,
        [session, org, loc, vehicle, member,
          "never-a-customer-token:" + randomUUID()],
      );
    }
    await client.query(
      `INSERT INTO key_slots(id,organization_id,location_id,code,updated_at)
       VALUES($1,$2,$3,'G2-SLOT',now())`, [ids.slot, ids.org, ids.location],
    );
    await client.query(
      `INSERT INTO tasks(id,organization_id,location_id,valet_session_id,
         task_type,status,updated_at)
       VALUES($1,$2,$3,$4,'PARKING','QUEUED',now())`,
      [ids.task, ids.org, ids.location, ids.session],
    );
    await client.query(
      `INSERT INTO tasks(id,organization_id,location_id,valet_session_id,
         task_type,status,updated_at)
       VALUES($1,$2,$3,$4,'RETRIEVAL','QUEUED',now())`,
      [ids.retrievalTask, ids.org, ids.location, ids.session],
    );
    const existingHash = (await client.query(
      `SELECT password_hash FROM users WHERE id=$1`, [users.admin.id],
    )).rows[0]?.password_hash;
    if (typeof existingHash !== "string") throw new Error("Missing isolated test-only hash");
    await client.query(
      `INSERT INTO users(id,email,password_hash,status,updated_at)
       VALUES($1,$2,$3,'ACTIVE',now())`,
      [ids.metadataUser, `${ids.metadataUser}@example.invalid`, existingHash],
    );
    await client.query(
      `INSERT INTO organization_memberships(id,organization_id,user_id,role,
        status,first_name,last_name,updated_at)
       VALUES($1,$2,$3,'VALET_EMPLOYEE','INACTIVE','Metadata','Only',now())`,
      [ids.metadataActor, ids.org, ids.metadataUser],
    );
    if (indirectAudit) for (const [auditId, taskId] of [
      [ids.metadataAudit, ids.task], [ids.badMetadataAudit, ids.retrievalTask],
    ]) {
      await client.query(
        `INSERT INTO audit_events(id,organization_id,location_id,
           valet_session_id,actor_membership_id,actor_type,event_type,
           entity_type,entity_id,metadata_json,occurred_at)
         VALUES($1,$2,$3,NULL,$4,'MEMBERSHIP','VALET_SESSION_PARKED',
           'LegacyParked',$5,jsonb_build_object('taskId',$6::text),
           '2026-10-16T11:12:00Z')`,
        [auditId, ids.org, ids.location, ids.metadataActor, randomUUID(), taskId],
      );
    }
    // A Vehicle entity without a direct Session pointer is NOT an independent
    // canonical relation, even when a coincidental PARKED taskId points here.
    if (indirectAudit) await client.query(
      `INSERT INTO audit_events(id,organization_id,location_id,
         valet_session_id,actor_membership_id,actor_type,event_type,
         entity_type,entity_id,metadata_json,occurred_at)
       VALUES($1,$2,$3,NULL,$4,'MEMBERSHIP','VALET_SESSION_PARKED',
         'Vehicle',$5,jsonb_build_object('taskId',$6::text),
         '2026-10-16T11:13:00Z')`,
      [ids.vehicleMetadataAudit, ids.org, ids.location,
        ids.metadataActor, ids.vehicle, ids.task],
    );
    await client.query(
      `INSERT INTO key_custody_events(id,organization_id,location_id,
         valet_session_id,key_slot_id,actor_membership_id,event_type,occurred_at)
       VALUES($1,$2,$3,$4,$5,$6,'CHECKED_OUT','2026-10-16T11:05:00Z')`,
      [ids.custody, ids.org, ids.location, ids.session, ids.slot,
        users.manager.membershipId],
    );
    await client.query(
      `INSERT INTO dispatch_events(id,organization_id,location_id,
         valet_session_id,task_id,event_type,new_assignee_membership_id,occurred_at)
       VALUES($1,$2,$3,$4,$5,'ASSIGNED',$6,'2026-10-16T11:10:00Z')`,
      [ids.dispatch, ids.org, ids.location, ids.session, ids.task,
        users.admin.membershipId],
    );
    await client.query(
      `INSERT INTO audit_events(id,organization_id,location_id,valet_session_id,
         actor_membership_id,actor_type,event_type,entity_type,entity_id,
         metadata_json,occurred_at)
       VALUES($1,$2,$3,$4,$5,'MEMBERSHIP','VALET_SESSION_PARKED',
         'ValetSession',$4,'{}'::jsonb,'2026-10-16T11:15:00Z')`,
      [ids.audit, ids.org, ids.location, ids.session, users.admin.membershipId],
    );
    await client.query(
      `INSERT INTO incidents(id,organization_id,location_id,valet_session_id,
         status,severity,type,description,reported_by_membership_id)
       VALUES($1,$2,$3,$4,'OPEN','HIGH','KEY_MISSING',
         'REDACT THIS PRIVATE DESCRIPTION',$5)`,
      [ids.incident, ids.org, ids.location, ids.session, users.manager.membershipId],
    );
    await client.query("COMMIT");
    return { ids, users, seededAt: now() };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
