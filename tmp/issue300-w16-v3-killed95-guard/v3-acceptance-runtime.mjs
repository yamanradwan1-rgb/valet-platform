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

export const evidenceDir=dirname(fileURLToPath(import.meta.url));
export const root=resolve(evidenceDir,"../..");
export const databaseRoot=join(root,"packages/database");
// Source-only --check must not require the live PG runtime dependency.
// Actual --run loads the real driver BEFORE resource admission/mutation.
let Client=null;
export const anchorSha="84e9aafc341fda5848261c4d0c1202a4fe2091b6";
export const dockerName="issue300_r2_w6_v3_pg17";
export const label="issue300-r2-w6-v3-acceptance";
export const volume="issue300_r2_w6_v3_pgdata";
export const port=58427;
export const owner="issue300_r2_w6_v3_owner";
export const role="issue300_r2_w6_v3_runtime";
export const image="sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193";
export const dbs={upgrade:"issue300_r2_w6_v3_upgrade",race:"issue300_r2_w6_v3_race",
  interrupted:"issue300_r2_w6_v3_interrupt",killed:"issue300_r2_w6_v3_kill",
  fresh:"issue300_r2_w6_v3_fresh"};
export const names=readdirSync(join(databaseRoot,"prisma/migrations"),{withFileTypes:true})
  .filter(x=>x.isDirectory()).map(x=>x.name).sort();
export const journal=join(evidenceDir,"V3_RAW_SANITIZED_EVIDENCE.jsonl");
export const privateFile=join(evidenceDir,"pg-private-v3.json");
export const manifestFile=join(evidenceDir,"pg-resource-v3.json");
export const ownerLeaseDir=join(root,"tmp/issue300-r2-v2-prime-owned");
export const ownerLeaseFile=join(ownerLeaseDir,"W6_V3_OWNER_LEASE.json");
export const publicSpki="MCowBQYDK2VwAyEApth1azlOHaJPPtirnSl5TB3UcAV/GOuWQeUFRx7wy/c=";
export const publicKey=createPublicKey({key:Buffer.from(publicSpki,"base64"),format:"der",type:"spki"});
let currentSha="",secrets=null,dockerId=null,ownership=false,lease=null,renewalRequired=false;
export const completed=new Set();
let hasGap=false,unsafePressure=false;
export const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
export function output(name,result,detail={}) {
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
export function verifySafeFile(file,maxBytes){
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
export function exactProperties(obj,fields){
  assert(obj&&typeof obj==="object"&&!Array.isArray(obj),"Invalid signed lease JSON");
  assert(JSON.stringify(Object.keys(obj).sort())===JSON.stringify([...fields].sort()),
    "Signed lease field list not exact");
}
export function validateSignedLease(){
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
export function ensureLeaseBudget(durationMs){
  assert(lease && Date.parse(lease.expiresAt)-Date.now()>=durationMs+15000,
    "Owner lease has insufficient time for next bounded phase plus 15s");
}
export function readHostMetrics(){
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
export function metricsSafe(metrics){
  return metrics.ramMiB>=1844 && metrics.commitMiB>=3072 &&
    metrics.cpu<70 && metrics.diskGiB>=2;
}
export function noOtherHeavyOwner(){
  const running=run("docker",["ps","--format","{{.Names}}"]).split(/\r?\n/).filter(Boolean);
  // Known live human R2 and reserved V2 remain untouched.
  const allowed=new Set([dockerName,"issue300_r2_w7_acceptance_v2_pg17",
    "issue300_r2_pg17","vaylet-photo-qa-postgres-1","vaylet-photo-qa-minio-1"]);
  assert(running.every(n=>allowed.has(n)),"Unknown competing Docker resource active");
}
export async function admissionSamples(){
  const measurements=[];
  for(let i=0;i<4;i++){
    const m=readHostMetrics();measurements.push(m);
    assert(metricsSafe(m),"Unsafe CPU/RAM/commit/disk at safety sample "+(i+1));
    noOtherHeavyOwner();
    if(i<3)await new Promise(r=>setTimeout(r,2000));
  }
  return measurements;
}
export function phaseGate(name,estimatedMs=30000){
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
export function run(cmd,args,env=process.env,timeout=30000) {
  return execFileSync(cmd,args,{windowsHide:true,env,encoding:"utf8",timeout,stdio:["ignore","pipe","ignore"]}).trim();
}
export function checkSourceBoundary(){
  const latest=run("git",["-C",root,"rev-parse","HEAD"]);
  assert(/^[a-f0-9]{40}$/.test(latest),"Git HEAD could not be pinned");
  run("git",["-C",root,"merge-base","--is-ancestor",anchorSha,latest]);
  run("git",["-C",root,"diff","--exit-code",anchorSha,latest,"--","packages/database"]);
  run("git",["-C",root,"diff","--exit-code","HEAD","--","packages/database"]);
  return latest;
}
export function inspect() {
  try{return JSON.parse(run("docker",["inspect",dockerName]))[0];}catch{return null;}
}
export function assertOwned(c,checkPassword=false) {
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
export function url(db,who=owner,pw=secrets.ownerPassword) {
  const u=new URL("postgresql://127.0.0.1:"+port+"/"+db);u.username=who;u.password=pw;return u.href;
}
export function config(db) {
  return {...process.env,NODE_ENV:"test",MIGRATION_DATABASE_URL:url(db),
    DATABASE_URL:url(db,role,secrets.runtimePassword),VAYLET_TEST_POSTGRES_CONNECTION_LIMIT:"3"};
}
export function activeSqlLease() {
  assert(lease && !renewalRequired,"V3 SQL needs a current signed Owner lease");
  return leaseValidUntil(validateSignedLease,Date.now,lease.leaseId,
    SQL_STATEMENT_TIMEOUT_MS + SQL_LEASE_MARGIN_MS);
}
export async function openGuardedSql(db,asRole=false,quarantineBeforeSocketDestroy=null) {
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
export async function sql(db,fn,asRole=false){
  const {client,guard}=await openGuardedSql(db,asRole);
  let result,operationError=null;
  try {result=await guard.run(fn);}
  catch(error){operationError=error;}
  try {await guard.close();} catch(error){operationError=operationError??error;}
  if(operationError)throw operationError;
  return result;
}

// Mutable campaign fields remain shared by all focused proof modules.
export const state={
  get Client(){return Client;}, set Client(value){Client=value;},
  get currentSha(){return currentSha;}, set currentSha(value){currentSha=value;},
  get secrets(){return secrets;}, set secrets(value){secrets=value;},
  get dockerId(){return dockerId;}, set dockerId(value){dockerId=value;},
  get ownership(){return ownership;}, set ownership(value){ownership=value;},
  get lease(){return lease;}, set lease(value){lease=value;},
  get renewalRequired(){return renewalRequired;}, set renewalRequired(value){renewalRequired=value;},
  get completed(){return completed;}, set completed(value){completed=value;},
  get hasGap(){return hasGap;}, set hasGap(value){hasGap=value;},
  get unsafePressure(){return unsafePressure;}, set unsafePressure(value){unsafePressure=value;},
};
export { execFileSync, spawn, randomUUID, randomBytes, createHash, mkdirSync,
  cpSync, existsSync, readdirSync, readFileSync, writeFileSync, chmodSync,
  symlinkSync, lstatSync, realpathSync, dirname, join, resolve, fileURLToPath,
  freemem, createRequire, net };
