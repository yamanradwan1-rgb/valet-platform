// Exclusive W6 V3 disposable migration acceptance. No other Docker resource.
// stdout and evidence omit secret fields; only task-owned ignored private file stores them.
import { execFileSync, spawn } from "node:child_process";
import { randomUUID, randomBytes, createHash, createPublicKey, verify } from "node:crypto";
import { mkdirSync, cpSync, existsSync, readdirSync, readFileSync, writeFileSync, chmodSync, symlinkSync, lstatSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { freemem } from "node:os";
import { createRequire } from "node:module";
import net from "node:net";
import { guardedSqlConnection, SQL_STATEMENT_TIMEOUT_MS, SQL_LEASE_MARGIN_MS,
  leaseValidUntil } from "./v3-sql-lease-watchdog.mjs";
import { killed95AppName, killed95WaitSql, killed95BackendSql,
  witnessAndKill95, heldLockExitBarrier95 }
  from "./v3-killed95-witness.mjs";

const evidenceDir=dirname(fileURLToPath(import.meta.url));
const root=resolve(evidenceDir,"../..");
const databaseRoot=join(root,"packages/database");
// Source-only --check must not require the live PG runtime dependency.
// Actual --run loads the real driver BEFORE resource admission/mutation.
let Client=null;
const anchorSha="84e9aafc341fda5848261c4d0c1202a4fe2091b6";
const dockerName="issue300_r2_w6_v3_pg17";
const label="issue300-r2-w6-v3-acceptance";
const volume="issue300_r2_w6_v3_pgdata";
const port=58427;
const owner="issue300_r2_w6_v3_owner";
const role="issue300_r2_w6_v3_runtime";
const image="sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193";
const dbs={upgrade:"issue300_r2_w6_v3_upgrade",race:"issue300_r2_w6_v3_race",
  interrupted:"issue300_r2_w6_v3_interrupt",killed:"issue300_r2_w6_v3_kill",
  fresh:"issue300_r2_w6_v3_fresh"};
const names=readdirSync(join(databaseRoot,"prisma/migrations"),{withFileTypes:true})
  .filter(x=>x.isDirectory()).map(x=>x.name).sort();
const journal=join(evidenceDir,"V3_RAW_SANITIZED_EVIDENCE.jsonl");
const privateFile=join(evidenceDir,"pg-private-v3.json");
const manifestFile=join(evidenceDir,"pg-resource-v3.json");
const ownerLeaseDir=join(root,"tmp/issue300-r2-v2-prime-owned");
const ownerLeaseFile=join(ownerLeaseDir,"W6_V3_OWNER_LEASE.json");
const publicSpki="MCowBQYDK2VwAyEApth1azlOHaJPPtirnSl5TB3UcAV/GOuWQeUFRx7wy/c=";
const publicKey=createPublicKey({key:Buffer.from(publicSpki,"base64"),format:"der",type:"spki"});
let currentSha="",secrets=null,dockerId=null,ownership=false,lease=null,renewalRequired=false;
const completed=new Set();
let hasGap=false,unsafePressure=false;
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
function output(name,result,detail={}) {
  // A finished PG query or callback is insufficient to justify PASS after
  // the independently signed Owner lease expires. Never fail-close cleanup
  // events such as GAP/STOP: those must remain reportable without authority.
  if(result==="PASS" && lease && name!=="owner_lease_extension"){
    leaseValidUntil(validateSignedLease,Date.now,lease.leaseId,0);
  }
  if(result==="GAP"||result==="FAIL"||result==="UNRUN")hasGap=true;
  if(result==="PASS")completed.add(name);
  const event={iso:new Date().toISOString(),sourceAnchor:anchorSha,stage:name,result,...detail};
  writeFileSync(journal,JSON.stringify(event)+"\n",{flag:"a",mode:0o600});
  console.log(JSON.stringify(event));
}
function verifySafeFile(file,maxBytes){
  // No symlink/reparse parent or replacement of signed bytes after realpath.
  const absolute=resolve(file),expectedParent=resolve(ownerLeaseDir);
  assert(dirname(absolute)===expectedParent,"Owner lease path changed");
  for(const p of [root,join(root,"tmp"),ownerLeaseDir,absolute]){
    const item=lstatSync(p);
    assert(!item.isSymbolicLink(),"Owner lease or ancestor is a symlink");
  }
  assert(realpathSync(dirname(absolute))===realpathSync(expectedParent),
    "Owner lease escaped Prime-owned directory");
  assert(lstatSync(absolute).isFile(),"Owner lease is not a regular file");
  const bytes=readFileSync(absolute);
  assert(bytes.length>0&&bytes.length<=maxBytes,"Owner lease file invalid length");
  return bytes;
}
function exactProperties(obj,fields){
  assert(obj&&typeof obj==="object"&&!Array.isArray(obj),"Invalid signed lease JSON");
  assert(JSON.stringify(Object.keys(obj).sort())===JSON.stringify([...fields].sort()),
    "Signed lease field list not exact");
}
function validateSignedLease(){
  const bytes=verifySafeFile(ownerLeaseFile,4096);
  const signatureText=verifySafeFile(ownerLeaseFile+".sig",256).toString("ascii").trim();
  assert(/^[A-Za-z0-9+/]{86}==$/.test(signatureText),"Owner lease signature not exact Base64 Ed25519");
  const signature=Buffer.from(signatureText,"base64");
  assert(signature.length===64&&verify(null,bytes,publicKey,signature),
    "Owner lease Ed25519 signature invalid or absent");
  const info=JSON.parse(bytes.toString("utf8"));
  exactProperties(info,["purpose","owner","candidateSha","sourceAnchor","dockerName",
    "containerLabel","volume","bind","issuedAt","expiresAt","leaseId"]);
  assert(info.purpose==="ISSUE300_R2_W6_V3_EXCLUSIVE_MIGRATION" &&
    info.owner==="worker-6" && info.candidateSha===currentSha &&
    info.sourceAnchor===anchorSha && info.dockerName===dockerName &&
    info.containerLabel===label && info.volume===volume &&
    info.bind==="127.0.0.1:"+port &&
    /^issue300-r2-w6-v3-[a-zA-Z0-9-]{8,}$/.test(info.leaseId),
    "Signed Owner lease lacks exact W6 V3 resource identity");
  const start=Date.parse(info.issuedAt),expiry=Date.parse(info.expiresAt),now=Date.now();
  assert(Number.isFinite(start)&&Number.isFinite(expiry)&&
    new Date(start).toISOString()===info.issuedAt &&
    new Date(expiry).toISOString()===info.expiresAt &&
    start<=now&&start>=now-5*60*1000&&
    expiry>now&&expiry-start<=5*60*1000&&expiry-start>0,
    "Signed Owner lease stale/future/expired/>5min");
  return {leaseId:info.leaseId,issuedAt:info.issuedAt,
    expiresAt:info.expiresAt,candidateSha:info.candidateSha};
}
function ensureLeaseBudget(durationMs){
  assert(lease && Date.parse(lease.expiresAt)-Date.now()>=durationMs+15000,
    "Owner lease has insufficient time for next bounded phase plus 15s");
}
function readHostMetrics(){
  const ps=[
    "$o=Get-CimInstance Win32_OperatingSystem",
    "$p=(Get-CimInstance Win32_Processor|Measure-Object LoadPercentage -Average).Average",
    "$d=Get-PSDrive -Name C",
    "if($null -eq $o -or $null -eq $p -or $null -eq $d){throw 'Host metrics unavailable'}",
    "[pscustomobject]@{ramMiB=[int]($o.FreePhysicalMemory/1024);commitMiB=[int]($o.FreeVirtualMemory/1024);cpu=[int]$p;diskGiB=[math]::Round($d.Free/1GB,3)}|ConvertTo-Json -Compress"
  ].join(";");
  const metrics=JSON.parse(run("powershell.exe",["-NoProfile","-NonInteractive","-Command",ps],process.env,14000));
  assert(["ramMiB","commitMiB","cpu","diskGiB"].every(k=>Number.isFinite(metrics[k])),
    "Incomplete host resource metrics");
  return metrics;
}
function metricsSafe(metrics){
  return metrics.ramMiB>=1844 && metrics.commitMiB>=3072 &&
    metrics.cpu<70 && metrics.diskGiB>=2;
}
function noOtherHeavyOwner(){
  const running=run("docker",["ps","--format","{{.Names}}"]).split(/\r?\n/).filter(Boolean);
  // Known live human R2 and reserved V2 remain untouched.
  const allowed=new Set([dockerName,"issue300_r2_w7_acceptance_v2_pg17",
    "issue300_r2_pg17","vaylet-photo-qa-postgres-1","vaylet-photo-qa-minio-1"]);
  assert(running.every(n=>allowed.has(n)),"Unknown competing Docker resource active");
}
async function admissionSamples(){
  const measurements=[];
  for(let i=0;i<4;i++){
    const m=readHostMetrics();measurements.push(m);
    assert(metricsSafe(m),"Unsafe CPU/RAM/commit/disk at safety sample "+(i+1));
    noOtherHeavyOwner();
    if(i<3)await new Promise(r=>setTimeout(r,2000));
  }
  return measurements;
}
function phaseGate(name,estimatedMs=30000){
  // Newly signed Prime extension is valid only when exact target stays frozen.
  const reverified=validateSignedLease();
  assert(!renewalRequired || reverified.leaseId!==lease.leaseId,
    "A new independently signed Owner lease is required after >60s phase");
  if(reverified.leaseId!==lease?.leaseId){
    assert(Date.parse(reverified.issuedAt)>Date.parse(lease.issuedAt),
      "Owner lease ID rotated backwards/replayed");
    lease=reverified;
    renewalRequired=false;
    output("owner_lease_extension","PASS",{leaseId:lease.leaseId,
      issuedAt:lease.issuedAt,expiresAt:lease.expiresAt,
      immutableTarget:true});
  }
  ensureLeaseBudget(estimatedMs);
  assert(checkSourceBoundary()===currentSha,"Integrated HEAD changed mid-campaign");
  noOtherHeavyOwner();
  const m=readHostMetrics();
  if(!metricsSafe(m)){unsafePressure=true;throw Error("Unsafe resources before "+name);}
  output("phase_safety_"+name,"PASS",{resourceMetrics:m});
}
function run(cmd,args,env=process.env,timeout=30000) {
  return execFileSync(cmd,args,{windowsHide:true,env,encoding:"utf8",timeout,stdio:["ignore","pipe","ignore"]}).trim();
}
function checkSourceBoundary(){
  const latest=run("git",["-C",root,"rev-parse","HEAD"]);
  assert(/^[a-f0-9]{40}$/.test(latest),"Git HEAD could not be pinned");
  run("git",["-C",root,"merge-base","--is-ancestor",anchorSha,latest]);
  run("git",["-C",root,"diff","--exit-code",anchorSha,latest,"--","packages/database"]);
  run("git",["-C",root,"diff","--exit-code","HEAD","--","packages/database"]);
  return latest;
}
function inspect() {
  try{return JSON.parse(run("docker",["inspect",dockerName]))[0];}catch{return null;}
}
function assertOwned(c,checkPassword=false) {
  assert(c?.Name==="/"+dockerName && c.Config.Labels["com.vaylet.task"]===label &&
    c.Config.Labels["com.vaylet.owner"]==="w6" &&
    c.Config.Labels["com.vaylet.source-anchor"]===anchorSha &&
    c.Image===image && c.Mounts.some(m=>m.Name===volume && m.Destination==="/var/lib/postgresql/data") &&
    c.HostConfig.Memory===384*1024*1024 &&
    c.HostConfig.NanoCpus===700000000 &&
    c.HostConfig.PortBindings?.["5432/tcp"]?.some(p=>p.HostIp==="127.0.0.1"&&Number(p.HostPort)===port),
  "Refuse touching unattested container");
  const env=Object.fromEntries(c.Config.Env.map(x=>[x.slice(0,x.indexOf("=")),x.slice(x.indexOf("=")+1)]));
  assert(env.POSTGRES_USER===owner && env.POSTGRES_DB===dbs.upgrade &&
    (!checkPassword||env.POSTGRES_PASSWORD===secrets.ownerPassword),"Docker bootstrap identity mismatch");
  assert(!dockerId||c.Id===dockerId,"Container identity changed");
  return c.Id;
}
function url(db,who=owner,pw=secrets.ownerPassword) {
  const u=new URL("postgresql://127.0.0.1:"+port+"/"+db);u.username=who;u.password=pw;return u.href;
}
function config(db) {
  return {...process.env,NODE_ENV:"test",MIGRATION_DATABASE_URL:url(db),
    DATABASE_URL:url(db,role,secrets.runtimePassword),VAYLET_TEST_POSTGRES_CONNECTION_LIMIT:"3"};
}
function activeSqlLease() {
  assert(lease && !renewalRequired,"V3 SQL needs a current signed Owner lease");
  return leaseValidUntil(validateSignedLease,Date.now,lease.leaseId,
    SQL_STATEMENT_TIMEOUT_MS + SQL_LEASE_MARGIN_MS);
}
async function openGuardedSql(db,asRole=false,quarantineBeforeSocketDestroy=null) {
  activeSqlLease();
  const client=new Client({connectionString:asRole?url(db,role,secrets.runtimePassword):url(db),
    connectionTimeoutMillis:5000,statement_timeout:SQL_STATEMENT_TIMEOUT_MS,
    query_timeout:SQL_STATEMENT_TIMEOUT_MS+SQL_LEASE_MARGIN_MS,
    application_name:"issue300-r2-w6-v3"});
  const guard=guardedSqlConnection(client,{
    assertCurrentLease:()=>{
      assert(lease&&!renewalRequired,"V3 SQL lease needs independent renewal");
      return validateSignedLease();
    },
    leaseId:lease.leaseId,
    statementTimeoutMs:SQL_STATEMENT_TIMEOUT_MS,
    marginMs:SQL_LEASE_MARGIN_MS,
    quarantineBeforeSocketDestroy,
  });
  try { await guard.start();return {client,guard}; }
  catch(error) {await guard.close().catch(()=>{});throw error;}
}
async function sql(db,fn,asRole=false){
  const {client,guard}=await openGuardedSql(db,asRole);
  let result,operationError=null;
  try {result=await guard.run(fn);}
  catch(error){operationError=error;}
  try {await guard.close();} catch(error){operationError=operationError??error;}
  if(operationError)throw operationError;
  return result;
}
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
      if(end-start>60000)renewalRequired=true;
      resolveChild({exitCode:code,ms:end-start,startedAtMs:start,endedAtMs:end,
        pressure,timedOut});};
    const watch=setInterval(()=>{
      if(Date.now()>=Date.parse(lease.expiresAt)){
        pressure=true;unsafePressure=true;child.kill("SIGKILL");
      }
      if(freemem()/1048576<950){pressure=true;unsafePressure=true;child.kill("SIGKILL");}
      if(++ticks%8===0 && !finished){
        try{
          const m=readHostMetrics();
          cpuPressureStreak=m.cpu>=94?cpuPressureStreak+1:0;
          if(m.commitMiB<2100||m.diskGiB<1.3||cpuPressureStreak>=2){
            pressure=true;unsafePressure=true;child.kill("SIGKILL");
          }
        }catch{pressure=true;unsafePressure=true;child.kill("SIGKILL");}
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
      if(Date.now()>=Date.parse(lease.expiresAt)||Date.now()-start>55000){
        unsafePressure=true;child.kill("SIGKILL");
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
function savePrivate(){
  assert(!existsSync(privateFile),"V3 private file already present");
  writeFileSync(privateFile,JSON.stringify({name:dockerName,volume,label,port,owner,
    dbs,role,ownerPassword:secrets.ownerPassword,runtimePassword:secrets.runtimePassword},
  null,2),{flag:"wx",mode:0o600});
  chmodSync(privateFile,0o600);
  if(process.platform==="win32"){
    const principal=run("whoami",[]);
    run("icacls",[privateFile,"/inheritance:r","/grant:r",principal+":(F)"]);
  }
}
async function portFree(){
  const server=net.createServer();
  await new Promise((done,fail)=>server.once("error",fail).listen(port,"127.0.0.1",done));
  await new Promise(done=>server.close(done));
}
async function launch(){
  assert(names.length===96,"Source migrations not 96");
  currentSha=checkSourceBoundary();
  lease=validateSignedLease();
  const resourceMeasurements=await admissionSamples();
  // Signed owner lease may expire during safety samples.
  assert(validateSignedLease().leaseId===lease.leaseId,
    "Signed owner lease invalid after measured safety sampling");
  assert(!inspect()&&!existsSync(privateFile),"V3 Docker/private resource already present");
  try{run("docker",["volume","inspect",volume]);throw Error("Volume already exists");}catch(e){
    if(e.message==="Volume already exists")throw e;
  }
  await portFree();
  output("preflight","PASS",{sourceAnchor:anchorSha,actualIntegrationHead:currentSha,
    ownerLeaseId:lease.leaseId,ownerLeaseExpiresAt:lease.expiresAt,
    migrationFilesIdentical:true,safetySamples:resourceMeasurements,port,dockerName,volume});
  secrets={ownerPassword:randomBytes(32).toString("hex"),runtimePassword:randomBytes(32).toString("hex")};
  savePrivate();
  run("docker",["volume","create","--label","com.vaylet.task="+label,volume]);
  const env={...process.env,POSTGRES_USER:owner,POSTGRES_DB:dbs.upgrade,
    POSTGRES_PASSWORD:secrets.ownerPassword};
  run("docker",["run","-d","--name",dockerName,
    "--label","com.vaylet.task="+label,"--label","com.vaylet.owner=w6",
    "--label","com.vaylet.source-anchor="+anchorSha,
    "--mount","type=volume,source="+volume+",target=/var/lib/postgresql/data",
    "-p","127.0.0.1:"+port+":5432","--memory","384m","--memory-swap","512m",
    "--cpus","0.7","-e","POSTGRES_USER="+owner,"-e","POSTGRES_DB="+dbs.upgrade,
    "-e","POSTGRES_PASSWORD="+secrets.ownerPassword,image,
    "-c","shared_buffers=32MB","-c","max_connections=18","-c","work_mem=1MB",
    "-c","maintenance_work_mem=32MB"],env,60000);
  dockerId=assertOwned(inspect(),true);ownership=true;
  let ready=false;
  for(let n=0;n<35;n++){
    try{
      const actual=await sql(dbs.upgrade,async(c)=>(await c.query("SELECT current_user AS who,current_database() AS db,current_setting('server_version_num')::int AS v")).rows[0]);
      assert(actual.who===owner&&actual.db===dbs.upgrade&&actual.v===170010,"Unexpected PG identity");
      ready=true;break;
    }catch{await new Promise(r=>setTimeout(r,600));}
  }
  assert(ready,"V3 auth bootstrap P1000/PG17.10 identity mismatch");
  writeFileSync(manifestFile,JSON.stringify({sourceSha:anchorSha,actualIntegrationHead:currentSha,dockerId,name:dockerName,
    label,volume,port,dbs,owner,role,postgres:"17.10",memoryMiB:384,cpuLimit:0.7,
    privateFileRelative:"tmp/issue300-r2-w6-v3-owned/pg-private-v3.json"},null,2),{flag:"wx",mode:0o600});
  output("new_v3_resource","PASS",{dockerId,name:dockerName,label,volume,
    port,postgres:"17.10",owner,role,databases:dbs});
}
async function createDb(name){
  await sql(dbs.upgrade,c=>c.query('CREATE DATABASE "'+name+'"'));
}
async function main(){
  assert(process.argv[2]==="--run","Explicit --run required");
  Client=createRequire(join(databaseRoot,"package.json"))("pg").Client;
  mkdirSync(evidenceDir,{recursive:true});
  await launch();
  phaseGate("initial_fixture_creation");
  await createDb(dbs.race);await createDb(dbs.interrupted);
  await createDb(dbs.killed);await createDb(dbs.fresh);
  phaseGate("fresh_zero_to96");
  const fresh=await migrate(dbs.fresh,96);
  output("fresh_zero_to96","PASS",{...fresh,catalog:await catalog(dbs.fresh,6,6),
    newDatabase:dbs.fresh,noHistoricalFixtures:true});
  phaseGate("upgrade_prefix93");
  output("upgrade_prefix93","PASS",{...await migrate(dbs.upgrade,93)});
  const ids=await fixture(dbs.upgrade);
  output("populated93","PASS",{committedHistoricalEntities:6,taskId:ids.task,
    incidentId:ids.incident,custodyId:ids.custody,dispatchId:ids.dispatch});
  for(const n of [94,95,96]){
    phaseGate("upgrade_"+n);
    const prefix=await migrate(dbs.upgrade,n);
    const c=await catalog(dbs.upgrade,n===94?5:6,n===94?0:n===95?4:6);
    output("upgrade_"+n,"PASS",{...prefix,catalog:c});
  }
  output("legacy_retention","PASS",await integrity(dbs.upgrade,ids));
  output("migration96_attribution_freeze","PASS",await attributionFreeze(dbs.upgrade,ids));
  phaseGate("canonical_runtime_acl");
  output("ordinary_role_acl","PASS",await provisionAndAcl(dbs.upgrade,ids));
  phaseGate("race_setup93");
  const rr=await migrate(dbs.race,93);
  output("race_prefix93","PASS",rr);
  phaseGate("concurrent_runners");
  await racing(dbs.race);
  phaseGate("interruption_setup93");
  const ir=await migrate(dbs.interrupted,93);
  output("interrupt_prefix93","PASS",ir);
  phaseGate("held_writer94");
  await interruption(dbs.interrupted);
  phaseGate("process_kill95");
  await processKillWhileLocked(dbs.killed);
}
if(process.argv[2]==="--check"){
  const actualHead=checkSourceBoundary();
  assert(names.length===96,"Missing migration source");
  for(const n of [94,95,96]){
    const statement=readFileSync(join(databaseRoot,"prisma/migrations",names[n-1],"migration.sql"),"utf8");
    assert(/^BEGIN;\s*$/m.test(statement)&&/^COMMIT;\s*$/m.test(statement) &&
      /SET LOCAL lock_timeout = '5s';/.test(statement),
      "Migration boundary lock timeout or transaction changed "+n);
  }
  const good=[{exitCode:0,startedAtMs:100,endedAtMs:400,timedOut:false,pressure:false},
    {exitCode:0,startedAtMs:200,endedAtMs:500,timedOut:false,pressure:false}];
  const witnessed={holderPid:101,waiterPid:102,actualAdvisoryWait:true};
  assert(racePassed(good,witnessed),"Positive race verdict oracle rejected valid overlap");
  assert(!racePassed([good[0],{...good[1],exitCode:1}],witnessed),
    "False PASS for second Prisma auth/lock loser");
  assert(!racePassed([good[0],{...good[1],exitCode:-9}],witnessed),
    "False PASS for second crashed Prisma process");
  assert(!racePassed(good,null),"False PASS with no live PG advisory lock witness");
  console.log(JSON.stringify({mode:"OFFLINE_ONLY",result:"PASS",anchoredSha:anchorSha,
    inspectedCurrentHead:actualHead,unchangedDatabaseTree:true,migrations:96,
    boundedTransactionMigrations:[94,95,96],raceNegativeOracleTests:3,
    name:dockerName,volume,port,
    mutatedDocker:false,requiresExplicitPrimeLease:true}));
}else{
  try{
    await main();
    const required=["preflight","new_v3_resource","fresh_zero_to96",
      "upgrade_prefix93","populated93",
      "upgrade_94","upgrade_95","upgrade_96","legacy_retention",
      "migration96_attribution_freeze","ordinary_role_acl","race_prefix93",
      "concurrent_prisma_runners","interrupt_prefix93","held_writer_lock94",
      "interruption_recovery","process_death_while_ddl_blocked",
      "interrupted95_catalog_reconciled"];
    const incomplete=required.filter(n=>!completed.has(n));
    assert(!hasGap&&incomplete.length===0,"Acceptance mandatory gates missing: "+incomplete.join(","));
    output("v3_overall","PASS",{allMandatoryGates:required.length,
      actualIntegrationHead:currentSha,resource:dockerName,
      note:"No shared DB/role/service touched; V3 alone was exercised"});
  }catch(e){
    // Guard against leaking Docker CLI -e POSTGRES_PASSWORD=..., DB URLs,
    // or private file content from raw child exception messages.
    let reason=String(e?.message??"Unknown V3 acceptance failure");
    for(const value of [secrets?.ownerPassword,secrets?.runtimePassword]){
      if(typeof value==="string"&&value.length)reason=reason.replaceAll(value,"[REDACTED]");
    }
    reason=reason.replace(/postgres(?:ql)?:\/\/[^\s]+/gi,"[REDACTED_PG_URL]");
    output("v3_failure","GAP",{message:reason.slice(0,170)});
    process.exitCode=1;
  }
  finally{
    // V3 is migration-only; don't retain running PG after lease release.
    if(ownership){
      try{
        const c=inspect();
        assertOwned(c,true);
        if(c.State.Running)run("docker",["stop","-t","1",dockerName]);
        output("v3_resource_handoff",unsafePressure?"STOPPED_ON_PRESSURE":"OWNED_PG_STOPPED",
          {id:dockerId,port,volume,protectedOtherResources:true});
      }catch{
        output("v3_resource_handoff","STOP_UNCONFIRMED",{port,volume});
        process.exitCode=1;
      }
    }
  }
}
