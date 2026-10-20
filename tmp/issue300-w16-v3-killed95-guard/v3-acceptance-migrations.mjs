export function createMigrationProof(ctx){
  const { assert, sql, databaseRoot, names, evidenceDir, ensureLeaseBudget, createHash, readFileSync, join, existsSync, mkdirSync, cpSync, symlinkSync, readdirSync, spawn, config, freemem, readHostMetrics, state } = ctx;
function digest(name){return createHash("sha256").update(readFileSync(join(databaseRoot,"prisma/migrations",name,"migration.sql"))).digest("hex");}
async function ledger(db,count,allowLastUnfinished=false){
  return sql(db,async(c)=>{
    const rows=(await c.query("SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY started_at,id")).rows;
    assert(rows.length===count,"Ledger length mismatch "+db+" "+rows.length+"/"+count);
    for(let i=0;i<rows.length;i++){
      assert(rows[i].migration_name===names[i]&&rows[i].checksum===digest(names[i]) &&
        (!rows[i].rolled_back_at)&& (allowLastUnfinished&&i===count-1||!!rows[i].finished_at),
        "Ledger checksum/outcome mismatch "+db+" migration "+(i+1));
    }
    return {entries:rows.length,finished:rows.filter(r=>!!r.finished_at).length,
      unfinished:rows.filter(r=>!r.finished_at&&!r.rolled_back_at).length};
  });
}
async function catalog(db,expectedXid,expectedImmutable){
  return sql(db,async(c)=>{
    const x=(await c.query("SELECT count(*)::int AS n FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid WHERE t.relnamespace='public'::regnamespace AND a.attname='pagination_birth_xid' AND NOT a.attisdropped")).rows[0].n;
    const b=(await c.query("SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgname LIKE '%_pagination_birth_%'")).rows[0].n;
    const i=(await c.query("SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgname LIKE '%issue300_%'")).rows[0].n;
    assert(x===expectedXid&&b===expectedXid*2&&i===expectedImmutable,"Catalog mismatch "+db);
    return {xidColumns:x,birthTriggers:b,immutableTriggers:i};
  });
}
function stagePath(count){
  const path=join(evidenceDir,"stage-"+count);
  if(!existsSync(path)){
    mkdirSync(join(path,"prisma/migrations"),{recursive:true});
    mkdirSync(join(path,"scripts"),{recursive:true});
    for(const f of ["package.json","prisma.config.ts"])cpSync(join(databaseRoot,f),join(path,f));
    for(const f of ["prisma/schema.prisma","prisma/migrations/migration_lock.toml",
      "scripts/database-connection-policy.mjs"])cpSync(join(databaseRoot,f),join(path,f));
    for(const name of names.slice(0,count))cpSync(join(databaseRoot,"prisma/migrations",name),
      join(path,"prisma/migrations",name),{recursive:true});
    symlinkSync(join(databaseRoot,"node_modules"),join(path,"node_modules"),"junction");
  }
  const localDirs=readdirSync(join(path,"prisma/migrations"),{withFileTypes:true})
    .filter(e=>e.isDirectory()).map(e=>e.name).sort();
  assert(localDirs.length===count && localDirs.every((n,i)=>n===names[i]),
    "Staged directory contains non-prefix migration set");
  for(const n of localDirs){
    const staged=createHash("sha256").update(
      readFileSync(join(path,"prisma/migrations",n,"migration.sql"))).digest("hex");
    assert(staged===digest(n),"Staged migration SQL checksum diverged: "+n);
  }
  for(const n of ["package.json","prisma.config.ts","prisma/schema.prisma",
    "prisma/migrations/migration_lock.toml","scripts/database-connection-policy.mjs"]){
    const hash=p=>createHash("sha256").update(readFileSync(p)).digest("hex");
    assert(hash(join(path,n))===hash(join(databaseRoot,n)),
      "Staged migration execution configuration differs: "+n);
  }
  return path;
}
function startSubprocess(db,count=96,extraArgs=[],timeoutMs=110000){
  ensureLeaseBudget(timeoutMs);
  const cwd=count===96?databaseRoot:stagePath(count);
  const args=[join(databaseRoot,"node_modules/prisma/build/index.js"),
    "migrate",extraArgs.length?"resolve":"deploy",...extraArgs];
  const start=Date.now();
  let processChild;
  const promise=new Promise(resolveChild=>{
    const child=spawn(process.execPath,args,{cwd,env:config(db),windowsHide:true,stdio:"ignore"});
    processChild=child;
    let finished=false,pressure=false,timedOut=false,cpuPressureStreak=0,ticks=0;
    const done=code=>{if(finished)return;finished=true;clearInterval(watch);
      const end=Date.now();
      if(end-start>60000)state.renewalRequired=true;
      resolveChild({exitCode:code,ms:end-start,startedAtMs:start,endedAtMs:end,
        pressure,timedOut});};
    const watch=setInterval(()=>{
      if(Date.now()>=Date.parse(state.lease.expiresAt)){
        pressure=true;state.unsafePressure=true;child.kill("SIGKILL");
      }
      if(freemem()/1048576<950){pressure=true;state.unsafePressure=true;child.kill("SIGKILL");}
      if(++ticks%8===0 && !finished){
        try{
          const m=readHostMetrics();
          cpuPressureStreak=m.cpu>=94?cpuPressureStreak+1:0;
          if(m.commitMiB<2100||m.diskGiB<1.3||cpuPressureStreak>=2){
            pressure=true;state.unsafePressure=true;child.kill("SIGKILL");
          }
        }catch{pressure=true;state.unsafePressure=true;child.kill("SIGKILL");}
      }
      if(Date.now()-start>timeoutMs){timedOut=true;child.kill("SIGKILL");}
    },500);
    child.once("error",()=>done(-2));
    child.once("exit",done);
  });
  return {child:processChild,promise};
}
async function subprocess(db,count=96,extraArgs=[],timeoutMs=110000){
  return startSubprocess(db,count,extraArgs,timeoutMs).promise;
}
async function migrate(db,count){
  const res=await subprocess(db,count);
  if(res.pressure)throw Error("Host RAM pressure during migration; ledger needs reconciliation");
  assert(!res.timedOut&&res.exitCode===0,"Prisma migration process failed stage "+count);
  const checks=await ledger(db,count);
  assert(checks.finished===count,"Unfinished migration after success");
  return {ms:res.ms,...checks};
}
  return { digest, ledger, catalog, stagePath, startSubprocess, subprocess, migrate };
}
