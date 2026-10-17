import { randomUUID } from "node:crypto";

/** Disposable SQL fixture ONLY. Call inside the caller's ROLLBACK transaction.
 * These inserts are not production domain-writer evidence (T01/T70 remain GAP).
 */
export async function prepareIssue300SqlWitnesses(client) {
  const ids = Object.fromEntries([
    "org", "location", "secondLocation", "user", "member", "otherUser",
    "otherMember", "unknownUser", "unknownMember", "badUser", "badMember",
    "vehicle", "vehicle2", "session", "session2", "slot",
    "task", "audit", "badTaskAudit", "badIncidentAudit", "unknownAudit",
    "custody", "dispatch", "incident",
  ].map((name) => [name, randomUUID()]));
  const insert = (sql, params) => client.query(sql, params);
  await insert(
    `INSERT INTO organizations(id,name,timezone,status,updated_at)
     VALUES($1,'Issue300 SQL G2 only','Asia/Amman','ACTIVE',now())`,
    [ids.org],
  );
  for (const [location, code] of [[ids.location, "G2-A"], [ids.secondLocation, "G2-B"]]) {
    await insert(
      `INSERT INTO locations(id,organization_id,name,code,address_text,
         timezone,currency,status,updated_at)
       VALUES($1,$2,'Issue300 isolated Location',$3,'Test only',
         'Asia/Amman','JOD','ACTIVE',now())`,
      [location, ids.org, code],
    );
  }
  for (const [user, member, label] of [
    [ids.user, ids.member, "Lead"], [ids.otherUser, ids.otherMember, "Other"],
    [ids.unknownUser, ids.unknownMember, "Unknown"],
    [ids.badUser, ids.badMember, "Contradictory"],
  ]) {
    await insert(
      `INSERT INTO users(id,email,password_hash,updated_at)
       VALUES($1,$2,'test-only-hash',now())`,
      [user, `${user}@issue300.invalid`],
    );
    await insert(
      `INSERT INTO organization_memberships(id,organization_id,user_id,role,status,
         first_name,last_name,updated_at)
       VALUES($1,$2,$3,'LOCATION_MANAGER','ACTIVE',$4,'Tester',now())`,
      [member, ids.org, user, label],
    );
  }
  for (const vehicle of [ids.vehicle, ids.vehicle2]) {
    await insert(
      `INSERT INTO vehicles(id,organization_id,make,model,
         temporary_descriptor,updated_at)
       VALUES($1,$2,'Toyota','Camry','G2 TEST VEHICLE',now())`,
      [vehicle, ids.org],
    );
  }
  for (const [session, vehicle] of [[ids.session, ids.vehicle], [ids.session2, ids.vehicle2]]) {
    await insert(
      `INSERT INTO valet_sessions(id,organization_id,location_id,vehicle_id,state,
         checked_in_by_membership_id,customer_access_token_hash,
         customer_access_expires_at,updated_at)
       VALUES($1,$2,$3,$4,'PARKED',$5,$6,now()+interval '1 day',now())`,
      [session, ids.org, ids.location, vehicle, ids.member,
        `issue300-disabled:${randomUUID()}`],
    );
  }
  await insert(
    `INSERT INTO key_slots(id,organization_id,location_id,code,updated_at)
     VALUES($1,$2,$3,'K-07',now())`,
    [ids.slot, ids.org, ids.location],
  );
  await insert(
    `INSERT INTO tasks(id,organization_id,location_id,valet_session_id,
       task_type,status,updated_at)
     VALUES($1,$2,$3,$4,'PARKING','QUEUED',now())`,
    [ids.task, ids.org, ids.location, ids.session],
  );
  const at = (time) => `2026-10-16T${time}:00.000Z`;
  await insert(
    `INSERT INTO key_custody_events(id,organization_id,location_id,valet_session_id,
       key_slot_id,actor_membership_id,event_type,occurred_at)
     VALUES($1,$2,$3,$4,$5,$6,'CHECKED_OUT',$7)`,
    [ids.custody, ids.org, ids.location, ids.session, ids.slot, ids.otherMember, at("11:04")],
  );
  await insert(
    `INSERT INTO dispatch_events(id,organization_id,location_id,valet_session_id,
       task_id,event_type,new_assignee_membership_id,occurred_at)
     VALUES($1,$2,$3,$4,$5,'ASSIGNED',$6,$7)`,
    [ids.dispatch, ids.org, ids.location, ids.session, ids.task, ids.member, at("11:08")],
  );
  const audit = async (id, entityType, entityId, kind, actor) => insert(
    `INSERT INTO audit_events(id,organization_id,location_id,valet_session_id,
       actor_membership_id,actor_type,event_type,entity_type,entity_id,
       metadata_json,occurred_at)
     VALUES($1,$2,$3,$4,$5,'MEMBERSHIP',$6,$7,$8,'{}'::jsonb,$9)`,
    [id, ids.org, ids.location, ids.session, actor, kind,
      entityType, entityId, at("11:10")],
  );
  await audit(ids.audit, "ValetSession", ids.session, "VALET_SESSION_PARKED", ids.member);
  // Real unsafe source contradictions must fail CLOSED for both search/timeline.
  await audit(ids.badTaskAudit, "TASK", randomUUID(), "VALET_SESSION_PARKED", ids.badMember);
  await audit(ids.badIncidentAudit, "Incident", randomUUID(), "INCIDENT_OPENED", ids.badMember);
  await audit(ids.unknownAudit, "ValetSession", ids.session, "ISSUE300_UNKNOWN", ids.unknownMember);
  await insert(
    `INSERT INTO incidents(id,organization_id,location_id,valet_session_id,
       status,severity,type,description,reported_by_membership_id)
     VALUES($1,$2,$3,$4,'OPEN','HIGH','KEY_MISSING',
       'PRIVATE TEST DESCRIPTION MUST NOT APPEAR',$5)`,
    [ids.incident, ids.org, ids.location, ids.session, ids.otherMember],
  );
  return { ids, at };
}
