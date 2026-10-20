export function createRaceProof(ctx){
  const { assert, sql, openGuardedSql, subprocess, ledger, catalog, digest, names, output, startSubprocess } = ctx;
async function interruption(db){
  const {client:conn,guard:connGuard}=await openGuardedSql(db);
  let verifiedFailure=null;
  try{
    verifiedFailure=await connGuard.run(async()=>{
    await conn.query("BEGIN");
    await conn.query("LOCK TABLE public.incidents IN ROW EXCLUSIVE MODE");
    // Prisma starts 94, waits on actual writer; SQL lock_timeout=5s aborts.
    const attempted=await subprocess(db,94,[],45000);
    assert(!attempted.timedOut&&!attempted.pressure&&attempted.exitCode!==0,"Held writer failed to block migration94");
    const l=await ledger(db,94,true);
    assert(l.finished===93&&l.unfinished===1,"Migration94 failure ledger not durable");
    const errorLog=await sql(db,async(c)=>(await c.query("SELECT logs FROM _prisma_migrations WHERE migration_name=$1 AND finished_at IS NULL",[names[93]])).rows[0]?.logs??"");
    assert(/55P03|lock timeout|canceling statement due to lock timeout/i.test(errorLog),"Failure lacked actual PostgreSQL lock-timeout evidence");
    const cat=await catalog(db,2,0);
    return {runner:attempted,ledger:l,catalog:cat,
      expectedSqlState:"55P03",sourceSqlLockTimeout:"5s"};
    });
  }finally{
    // No unguarded ROLLBACK after expiry. Signed authority and permanent
    // client.query denial remain enforced even if fn resumes after revocation.
    await conn.query("ROLLBACK").catch(()=>{});
    await connGuard.close().catch(()=>{});
  }
  // Never publish PASS until the complete held-writer callback succeeded.
  output("held_writer_lock94","PASS",verifiedFailure);
  // Automatic repair is forbidden. On THIS throwaway DB only, prove exact failed
  // migration94 and absent DDL; then run canonical explicit resolve --rolled-back.
  const failed=await sql(db,async(c)=>{
    const r=(await c.query("SELECT finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name=$1",[names[93]])).rows;
    assert(r.length===1&&!r[0].finished_at&&!r[0].rolled_back_at,"Unexpected interrupted migration status");
    return true;
  });
  assert(failed,"Unsafe migration state");
  const resolved=await subprocess(db,96,["--rolled-back",names[93]],40000);
  assert(resolved.exitCode===0&&!resolved.timedOut&&!resolved.pressure,"Failed Prisma explicit rollback declaration");
  // Ledger now has a rolled-back attempt + a new successful attempt after deploy.
  const resumed=await subprocess(db,96,[],110000);
  assert(resumed.exitCode===0&&!resumed.timedOut&&!resumed.pressure,"Interrupted migration recovery failed");
  const l=await sql(db,async(c)=>{
    const r=(await c.query("SELECT migration_name,finished_at,rolled_back_at,checksum FROM _prisma_migrations ORDER BY started_at,id")).rows;
    assert(r.length===97&&r.filter(x=>x.rolled_back_at).length===1&&r.filter(x=>x.finished_at).length===96,
      "Recovery 97-row ledger mismatch");
    assert(r.filter(x=>x.rolled_back_at)[0].migration_name===names[93],"Wrong rolled-back migration");
    for(const n of names)assert(r.some(x=>x.migration_name===n&&x.finished_at&&x.checksum===digest(n)),
      "Recovered checksum missing "+n);
    return {entries:r.length,finished:96,rolledBackAttempts:1};
  });
  output("interruption_recovery","PASS",{resolveExit:resolved.exitCode,resumeExit:resumed.exitCode,
    ledger:l,catalog:await catalog(db,6,6)});
}
function racePassed(attempts,observed){
  return attempts.length===2&&attempts.every(x=>x.exitCode===0&&!x.timedOut&&!x.pressure)&&
    Math.max(...attempts.map(x=>x.startedAtMs))<
    Math.min(...attempts.map(x=>x.endedAtMs))&&
    observed&&observed.holderPid>0&&observed.waiterPid>0&&
    observed.holderPid!==observed.waiterPid&&observed.actualAdvisoryWait===true;
}
async function advisoryLocks(db){
  return sql(db,async(c)=>(await c.query(
    "SELECT l.pid,l.database,l.classid,l.objid,l.objsubid,l.mode,l.granted,a.wait_event_type " +
    "FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid " +
    "WHERE l.locktype='advisory' AND a.datname=current_database() AND " +
    "a.usename=current_user AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database())"
  )).rows);
}
async function racing(db){
  const start=Date.now();
  const {client:writer,guard:writerGuard}=await openGuardedSql(db);
  let first=null,second=null,observation=null;
  try{
    await writerGuard.run(async()=>{
    await writer.query("BEGIN");
    await writer.query("LOCK TABLE public.incidents IN ROW EXCLUSIVE MODE");
    first=startSubprocess(db,96);
    let holding=null;
    for(let i=0;i<25;i++){
      const rows=await advisoryLocks(db);
      holding=rows.find(x=>x.granted===true);
      if(holding)break;
      await new Promise(r=>setTimeout(r,90));
    }
    assert(holding,"First real Prisma runner never obtained advisory lock");
    second=startSubprocess(db,96);
    for(let i=0;i<30;i++){
      const rows=await advisoryLocks(db);
      const contender=rows.find(x=>x.granted===false &&
        x.pid!==holding.pid&&x.classid===holding.classid&&
        x.objid===holding.objid&&x.objsubid===holding.objsubid &&
        x.wait_event_type==="Lock");
      if(contender){
        observation={holderPid:holding.pid,waiterPid:contender.pid,
          actualAdvisoryWait:true,keyClass:holding.classid,
          keyObject:holding.objid,heldLockMode:holding.mode,
          waitLockMode:contender.mode,waitEvent:"Lock"};
        break;
      }
      await new Promise(r=>setTimeout(r,90));
    }
    assert(observation,"Two canonical Prisma runners did NOT demonstrably contend for the same actual PG advisory lock");
    });
  }finally{
    // Release before migration94's 5s DDL lock timeout; all DB actions remain owned V3.
    await writer.query("ROLLBACK").catch(()=>{});
    await writerGuard.close().catch(()=>{});
    if(!observation)for(const p of [first,second])if(p?.child&&!p.child.killed)p.child.kill("SIGKILL");
  }
  assert(first&&second&&observation,"Missing independently observed advisory ordering");
  const concurrent=await Promise.all([first.promise,second.promise]);
  assert(racePassed(concurrent,observation),
    "Both Prisma runners must exit 0 after genuine PG advisory contention; any other auth/crash/lock loser is FAIL");
  const checked=await ledger(db,96);
  assert(checked.finished===96&&checked.unfinished===0,"Concurrent ledger not fully complete");
  const c=await catalog(db,6,6);
  output("concurrent_prisma_runners","PASS",{launches:2,attempts:concurrent,wallMs:Date.now()-start,
    advisoryLockWitness:observation,finalLedger:checked,catalog:c});
}
  return { interruption, racePassed, racing };
}
