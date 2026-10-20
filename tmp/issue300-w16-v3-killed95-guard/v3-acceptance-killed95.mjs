import { killed95AppName, killed95WaitSql, killed95BackendSql,
  witnessAndKill95, heldLockExitBarrier95 } from "./v3-killed95-witness.mjs";
import { SQL_STATEMENT_TIMEOUT_MS, SQL_LEASE_MARGIN_MS }
  from "./v3-sql-lease-watchdog.mjs";
export function createKilled95Proof(ctx){
  const { assert, sql, openGuardedSql, subprocess, migrate, catalog, digest, names, output, run, inspect, assertOwned, dockerName, ensureLeaseBudget, spawn, join, databaseRoot, stagePath, config } = ctx;
async function processKillWhileLocked(db){
  // Kill an ACTUAL Prisma runner while waiting on a held writer. No app services.
  await migrate(db,94);
  let child=null,settled=null,stopEvidence=null,verifiedDrain=false;
  let holderLeaseRevoked=false,quarantinePromise=null,unknownLogged=false;
  const unknown=()=>{
    if(unknownLogged)return;
    unknownLogged=true;
    output("killed95_unknown_quarantine","GAP",{
      childPid:child?.pid??null,observedDrain:false,
      reason:"Cannot establish exact killed95 backend drain and held-lock custody",
    });
  };
  // One task-owned resource stop, with exact identity checks on both sides.
  // On failure we retain UNKNOWN: a lease-revoked holder never drops its
  // socket intentionally before a successful independent PG stop.
  const stopExactOwnedPg=()=>{
    if(!quarantinePromise)quarantinePromise=(async()=>{
      // Logging failure must NEVER prevent the emergency owned-PG stop.
      // No later PASS is possible: unknownLogged becomes true before output.
      try{unknown();}catch{}
      const before=inspect();
      assertOwned(before,true);
      if(before.State?.Running)run("docker",["stop","-t","1",dockerName]);
      const after=inspect();
      assertOwned(after,true);
      assert(after.State?.Running===false,
        "KILLED95_QUARANTINE_STOP_UNCONFIRMED");
      output("killed95_owned_pg_quarantined","GAP",{
        actualOwnedContainerStopped:true,mayNeedManualLedgerReconciliation:true,
      });
      return true;
    })();
    return quarantinePromise;
  };
  const {client:lock,guard:lockGuard}=await openGuardedSql(db,false,async()=>{
    holderLeaseRevoked=true;
    return stopExactOwnedPg();
  });
  try{
    stopEvidence=await lockGuard.run(async()=>{
    await lock.query("BEGIN");
    await lock.query("LOCK TABLE public.tasks IN ROW EXCLUSIVE MODE");
    const started=Date.now();
    ensureLeaseBudget(30000);
    // PGAPPNAME is an unverified Prisma-driver bridge. Only a real backend
    // that echoes this unique per-child tag AND waits on migration95's exact
    // AccessExclusiveLock(public.tasks) can qualify. No echo => REFUSE.
    const appName=killed95AppName();
    child=spawn(process.execPath,[join(databaseRoot,"node_modules/prisma/build/index.js"),
      "migrate","deploy"],{cwd:stagePath(95),
      env:{...config(db),PGAPPNAME:appName},stdio:"ignore",windowsHide:true});
    settled=new Promise(done=>{
      let completed=false;
      const finish=event=>{if(!completed){completed=true;done(event);}};
      child.once("exit",(code,signal)=>finish({code,signal,error:null}));
      child.once("error",error=>finish({code:null,signal:null,error:error?.code??"spawn"}));
    });
    const death=await witnessAndKill95({
      child,appName,startedAtMs:started,exitPromise:settled,
      readWaitRows:async tag=>sql(db,async(c)=>
        (await c.query(killed95WaitSql,[tag])).rows),
      // Each read uses a fresh guarded PG connection/snapshot, never
      // the connection holding the writer lock or a stale transaction.
      readBackendRows:async(pid,tag)=>sql(db,async(c)=>
        (await c.query(killed95BackendSql,[pid,tag])).rows),
    });
    // A fresh check that the same held-writer backend still holds the actual
    // conflicting relation lock, with valid signed SQL lease, is essential:
    // no PASS if lease watchdog had already released it.
    lockGuard.check(SQL_STATEMENT_TIMEOUT_MS+SQL_LEASE_MARGIN_MS);
    const holder=(await lock.query(
      "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid() "+
      "AND locktype='relation' AND relation='public.tasks'::regclass "+
      "AND mode='RowExclusiveLock' AND granted=true) AS held")).rows[0];
    verifiedDrain=death.backendDrained===true && holder?.held===true &&
      !holderLeaseRevoked && !lockGuard.aborted;
    assert(verifiedDrain,"KILLED95_UNDRAINED_BACKEND_QUARANTINE");
    const state=await sql(db,async(c)=>(await c.query(
      "SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY started_at,id")).rows);
    assert((state.length===94||state.length===95) &&
      state.slice(0,94).every((x,i)=>x.migration_name===names[i]&&
        x.checksum===digest(names[i])&&!!x.finished_at&&!x.rolled_back_at) &&
      (state.length===94||state[94].migration_name===names[94]&&
        !state[94].finished_at&&!state[94].rolled_back_at),
    "Aborted process ledger not a clean committed prefix94");
    const c=await catalog(db,5,0);
    return {actualWaitEvent:"Lock",...death,
      wallMs:Date.now()-started,committedPrefix:94,
      unfinished95:state.length===95,catalog:c};
    });
  }finally{
    await heldLockExitBarrier95({
      verifiedDrain:verifiedDrain&&!holderLeaseRevoked&&!lockGuard.aborted,
      markUnknown:async()=>{
        unknown();
        // If the proof failed, do not just fire-and-forget SIGKILL.
        if(child && child.exitCode===null && child.signalCode===null &&
           !child.killed)child.kill("SIGKILL");
        if(settled)await Promise.race([
          settled,
          new Promise(r=>setTimeout(()=>r({unobserved:true}),1500)),
        ]);
      },
      stopOwnedPg:stopExactOwnedPg,
      releaseHeldLock:async()=>{
        // PostgreSQL is either independently proven drained or STOPPED.
        // Never unlock first and let a detached migration finish its DDL.
        if(verifiedDrain&&!holderLeaseRevoked&&!lockGuard.aborted){
          await lock.query("ROLLBACK");
          await lockGuard.close();
        }else await lockGuard.close().catch(()=>{});
      },
    });
  }
  // An interrupted 95 row may or may not have entered Prisma's ledger;
  // reconcile state and exact absence of all Option B DDL before a retry.
  const state=await sql(db,async(c)=>(await c.query(
    "SELECT migration_name,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS rolled_back FROM _prisma_migrations WHERE migration_name=$1",[names[94]])).rows);
  assert(state.length<=1&&state.every(x=>!x.finished&&!x.rolled_back),"Killed runner published partial migration95");
  let resolveExit=null;
  if(state.length===1){
    const fix=await subprocess(db,96,["--rolled-back",names[94]],40000);
    assert(fix.exitCode===0&&!fix.timedOut&&!fix.pressure,"Explicit killed migration95 resolve failed");
    resolveExit=fix.exitCode;
  }
  const retry=await subprocess(db,96,[],110000);
  assert(retry.exitCode===0&&!retry.timedOut&&!retry.pressure,"Migration95 recovery retry failed");
  const reconciled=await sql(db,async(c)=>{
    const r=(await c.query("SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY started_at,id")).rows;
    assert(r.length===96+state.length &&
      r.filter(x=>x.finished_at).length===96 &&
      r.filter(x=>x.rolled_back_at).length===state.length,
    "Post-kill migration ledger has wrong completed/rollback counts");
    for(const n of names)
      assert(r.some(x=>x.migration_name===n&&x.checksum===digest(n)&&!!x.finished_at),
        "Recovered ledger missing immutable migration checksum");
    return {entries:r.length,finished:96,explicitlyRolledBack:state.length};
  });
  const finalCatalog=await catalog(db,6,6);
  // No killed95 PASS before verified PG disappearance AND full reconciliation.
  assert(!holderLeaseRevoked&&!lockGuard.aborted&&!unknownLogged&&
    verifiedDrain&&stopEvidence?.backendDrained===true,
  "KILLED95_HOLDER_LEASE_OR_BACKEND_UNKNOWN_QUARANTINE");
  output("process_death_while_ddl_blocked","PASS",stopEvidence);
  output("interrupted95_catalog_reconciled","PASS",{killWaitEvent:"Lock",
    earlierUnfinished95:state.length,explicitResolveExit:resolveExit,
    resumedMigrationExit:retry.exitCode,ledger:reconciled,catalog:finalCatalog});
}
  return { processKillWhileLocked };
}
