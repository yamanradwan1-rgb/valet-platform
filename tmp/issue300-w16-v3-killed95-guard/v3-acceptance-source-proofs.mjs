export function createSourceProof(ctx){
  const { assert, sql, randomUUID, spawn, databaseRoot, config, role, ensureLeaseBudget, state } = ctx;
async function fixture(db){
  return sql(db,async(c)=>{
    const ids=Object.fromEntries(["org","loc","user","member","vehicle","session","task",
      "incident","audit","slot","custody","dispatch"].map(k=>[k,randomUUID()]));
    await c.query("BEGIN");
    try {
      await c.query("INSERT INTO organizations(id,name,timezone,updated_at) VALUES($1,'W6 V3','Asia/Amman',now())",[ids.org]);
      await c.query("INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,status,updated_at) VALUES($1,$2,'W6','W6','Disposable','Asia/Amman','JOD','ACTIVE',now())",[ids.loc,ids.org]);
      await c.query("INSERT INTO users(id,email,password_hash,updated_at) VALUES($1,$2,'v3-test',now())",[ids.user,ids.user+"@w6.invalid"]);
      await c.query("INSERT INTO organization_memberships(id,organization_id,user_id,role,updated_at) VALUES($1,$2,$3,'VALET_EMPLOYEE',now())",[ids.member,ids.org,ids.user]);
      await c.query("INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at) VALUES($1,$2,'V3',now())",[ids.vehicle,ids.org]);
      await c.query("INSERT INTO key_slots(id,organization_id,location_id,code,status,updated_at) VALUES($1,$2,$3,'W6-V3-KEY','ACTIVE',now())",[ids.slot,ids.org,ids.loc]);
      await c.query("INSERT INTO valet_sessions(id,customer_access_token_hash,customer_access_expires_at,organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,updated_at) VALUES($1,$2,now()+interval '1 day',$3,$4,$5,'CHECKING_IN',$6,now())",[ids.session,"w6v3:"+ids.session,ids.org,ids.loc,ids.vehicle,ids.member]);
      await c.query("INSERT INTO tasks(id,organization_id,location_id,valet_session_id,task_type,status,updated_at) VALUES($1,$2,$3,$4,'PARKING','QUEUED',now())",[ids.task,ids.org,ids.loc,ids.session]);
      await c.query("INSERT INTO key_custody_events(id,organization_id,location_id,valet_session_id,key_slot_id,actor_membership_id,event_type,occurred_at) VALUES($1,$2,$3,$4,$5,$6,'CHECKED_OUT',now())",
        [ids.custody,ids.org,ids.loc,ids.session,ids.slot,ids.member]);
      await c.query("INSERT INTO dispatch_events(id,organization_id,location_id,valet_session_id,task_id,event_type,actor_membership_id,occurred_at) VALUES($1,$2,$3,$4,$5,'QUEUED',$6,now())",
        [ids.dispatch,ids.org,ids.loc,ids.session,ids.task,ids.member]);
      await c.query("INSERT INTO incidents(id,organization_id,location_id,valet_session_id,status,severity,type,description,reported_by_membership_id) VALUES($1,$2,$3,$4,'OPEN','LOW','V3_TEST','fixture',$5)",[ids.incident,ids.org,ids.loc,ids.session,ids.member]);
      await c.query("INSERT INTO audit_events(id,organization_id,location_id,valet_session_id,actor_type,event_type,entity_type,entity_id,metadata_json,occurred_at) VALUES($1,$2,$3,$4,'SYSTEM','V3_TEST','ValetSession',$4,'{}',now())",[ids.audit,ids.org,ids.loc,ids.session]);
      await c.query("COMMIT");return ids;
    }catch(e){await c.query("ROLLBACK");throw Error("Stage93 historical fixture failed");}
  });
}
async function integrity(db,ids){
  return sql(db,async(c)=>{
    const out={};
    const entityId={audit_events:ids.audit,valet_sessions:ids.session,tasks:ids.task,
      incidents:ids.incident,key_custody_events:ids.custody,dispatch_events:ids.dispatch};
    for(const [table,id] of Object.entries(entityId)){
      out[table]=Number((await c.query(
        "SELECT count(*) AS n FROM "+table+" WHERE id=$1 AND organization_id=$2 AND location_id=$3",
        [id,ids.org,ids.loc])).rows[0].n);
      assert(out[table]===1,"Exactly one scoped legacy source not retained "+table);
    }
    for(const table of ["tasks","incidents","key_custody_events","dispatch_events"]){
      out[table+"LegacyNullXid"]=Number((await c.query("SELECT count(*) AS n FROM "+table+" WHERE pagination_birth_xid IS NULL")).rows[0].n);
      assert(out[table+"LegacyNullXid"]===1,"Historical XID backfilled or duplicated "+table);
    }
    out.keyCustodySlotScope=Number((await c.query(
      "SELECT count(*)::int AS n FROM key_custody_events WHERE id=$1 AND valet_session_id=$2 AND key_slot_id=$3 AND actor_membership_id=$4",
      [ids.custody,ids.session,ids.slot,ids.member])).rows[0].n);
    out.dispatchTaskScope=Number((await c.query(
      "SELECT count(*)::int AS n FROM dispatch_events WHERE id=$1 AND valet_session_id=$2 AND task_id=$3",
      [ids.dispatch,ids.session,ids.task])).rows[0].n);
    assert(out.keyCustodySlotScope===1&&out.dispatchTaskScope===1,
      "Canonical FK/parent association changed after migration");
    return out;
  });
}
async function attributionFreeze(db,ids){
  return sql(db,async(c)=>{
    await c.query("BEGIN");const results={};
    const cases=[
      {name:"audit_controlled_operator_ref",table:"audit_events",id:ids.audit,change:"controlled_operator_ref='FORGED'"},
      {name:"audit_idempotency_key",table:"audit_events",id:ids.audit,change:"idempotency_key='w6-v3-forged'"},
      {name:"session_checked_in_by",table:"valet_sessions",id:ids.session,change:"checked_in_by_membership_id=NULL"},
      {name:"session_created_at",table:"valet_sessions",id:ids.session,change:"created_at=created_at + interval '1 second'"},
    ];
    try{
      for(const test of cases){
        await c.query("SAVEPOINT w6_immutable");
        let state=null;
        try{await c.query("UPDATE "+test.table+" SET "+test.change+" WHERE id=$1",[test.id]);}
        catch(error){state=error.code;}
        await c.query("ROLLBACK TO SAVEPOINT w6_immutable");
        await c.query("RELEASE SAVEPOINT w6_immutable");
        assert(state==="23514","Migration96 allowed forbidden "+test.name+"; SQLSTATE="+(state??"SUCCESS"));
        results[test.name]=state;
      }
    }finally{await c.query("ROLLBACK");}
    return {triggerDenials:results,rolledBackFixture:true};
  });
}
async function provisionAndAcl(db,ids){
  ensureLeaseBudget(55000);
  const p=await new Promise(r=>{
    const child=spawn(process.execPath,["scripts/provision-runtime-role.mjs"],
      {cwd:databaseRoot,env:config(db),stdio:"ignore",windowsHide:true});
    const start=Date.now();
    const timer=setInterval(()=>{
      if(Date.now()>=Date.parse(state.lease.expiresAt)||Date.now()-start>55000){
        state.unsafePressure=true;child.kill("SIGKILL");
      }
    },500);
    child.once("error",()=>{clearInterval(timer);r(-2);});
    child.once("exit",code=>{clearInterval(timer);r(code);});
  });
  assert(p===0,"Canonical runtime role provisioning failed");
  const acl=await sql(db,async(c)=>{
    assert((await c.query("SELECT current_user AS who")).rows[0].who===role,"Actual runtime login mismatch");
    const flags=(await c.query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit FROM pg_roles WHERE rolname=current_user")).rows[0];
    assert(Object.values(flags).every(v=>v===false),"Runtime role elevated");
    for(const table of ["audit_events","incidents","dispatch_events","key_custody_events"]){
      const a=(await c.query("SELECT has_table_privilege(current_user,$1,'UPDATE') AS w,has_table_privilege(current_user,$1,'DELETE') AS d,has_table_privilege(current_user,$1,'TRUNCATE') AS t",[table])).rows[0];
      assert(!a.w&&!a.d&&!a.t,"Evidence writable/delete/truncate "+table);
    }
    for(const table of ["tasks","valet_sessions"])
      assert((await c.query("SELECT has_table_privilege(current_user,$1,'UPDATE') AS w",[table])).rows[0].w,"Operational update missing");
    await c.query("BEGIN");let triggerDenied=false;
    try{await c.query("ALTER TABLE audit_events DISABLE TRIGGER ALL");}catch(e){triggerDenied=e.code==="42501";}
    await c.query("ROLLBACK");assert(triggerDenied,"DDL/trigger bypass allowed");
    await c.query("BEGIN");let truncateDenied=false;
    try{await c.query("TRUNCATE TABLE public.audit_events");}
    catch(e){truncateDenied=e.code==="42501";}
    await c.query("ROLLBACK");assert(truncateDenied,"Actual runtime TRUNCATE succeeded");
    await c.query("BEGIN");
    const before=(await c.query("SELECT version,pagination_birth_xid::text AS born FROM tasks WHERE id=$1",[ids.task])).rows[0];
    let rejected=false;
    try{
      await c.query("UPDATE tasks SET version=version+1,pagination_birth_xid='1'::xid8 WHERE id=$1",[ids.task]);
      await c.query("UPDATE valet_sessions SET version=version+1 WHERE id=$1",[ids.session]);
      const after=(await c.query("SELECT pagination_birth_xid::text AS born FROM tasks WHERE id=$1",[ids.task])).rows[0];
      assert(after.born===before.born,"Task marker tampered");
      await c.query("SAVEPOINT den");
      try{await c.query("UPDATE tasks SET organization_id=$2 WHERE id=$1",[ids.task,randomUUID()]);}catch(e){rejected=e.code==="23514";}
      await c.query("ROLLBACK TO SAVEPOINT den");
      assert(rejected,"Immutable relation rewrite accepted");
    }finally{await c.query("ROLLBACK");}
    const version=(await c.query("SELECT version FROM tasks WHERE id=$1",[ids.task])).rows[0].version;
    assert(version===before.version,"Transaction rollback did not restore Task");
    return {actualRuntimeLogin:true,noPrivilegedRoleFlags:true,appendOnlyAcl:true,
      allowedOperationalUpdates:true,disableTriggerDenied:triggerDenied,
      truncateEvidenceDenied:truncateDenied,
      immutableRelationRejected:rejected,rolledBackVersion:true};
  },true);
  const ownerGuard=await sql(db,async(c)=>{
    const owned=(await c.query("SELECT count(*)::int AS n FROM pg_class cl JOIN pg_roles r ON r.oid=cl.relowner WHERE cl.relnamespace='public'::regnamespace AND r.rolname=$1",[role])).rows[0].n;
    assert(owned===0,"Ordinary role owns schema objects");
    for(const fn of ["management_pagination_preserve_birth_xid","issue300_prevent_relation_rewrite","issue300_prevent_attribution_rewrite"]){
      const r=(await c.query("SELECT has_function_privilege($1,p.oid,'EXECUTE') AS can_execute,p.prosecdef,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure($2)",[role,"public."+fn+"()"])).rows[0];
      assert(r&&!r.can_execute&&r.prosecdef===false&&(r.proconfig??[]).includes("search_path=pg_catalog, public"),"Unsafe trigger function ACL/search_path");
    }
    return {ownsNoObjects:true,triggerFunctionExecuteDenied:true};
  });
  return {...acl,...ownerGuard};
}
  return { fixture, integrity, attributionFreeze, provisionAndAcl };
}
