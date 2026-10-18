import test from "node:test";
import assert from "node:assert/strict";
import { assertTargetManifest, assertOwnedUri } from "./issue300-w8-target.mjs";
import { fixturePlan, fixtureStatement } from "./issue300-w8-fixture.mjs";
import { assertWriterRoster } from "./issue300-w8-writer-clients.mjs";
import { verifyColdBoot } from "./issue300-w8-cold.mjs";
import { canonicalSql } from "./issue300-w8-plans.mjs";
import { assertNonemptyPlan } from "./issue300-w8-plans.mjs";
import { verifyPinnedRoutes, assertExpectedHttp, verifiedSourceOracle } from
  "./issue300-w8-http-evidence.mjs";
import { assertSignedGuestBoot } from "./issue300-w8-cold.mjs";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const sha = "a0a6fb1c032088be67437e93e8f4b5dbb9461a5a";
const lease = "issue300-r2-w8-alpha-123456";
const own = "issue300-r2-w7-acceptance-alpha";
const dataPath = "D:\\kndoom\\valet-platform\\tmp\\"+
  "issue300-r2-w7-acceptance-alpha\\data\\";
const resource = {
  container:own,database:"issue300_r2_w7_acceptance_alpha",
  dockerTaskLabel:"issue300-r2-w7-acceptance",dataPath,
  containerId:"b".repeat(64),volumeId:"issue300_w8_data",
  dbHost:"127.0.0.1",dbPort:58411,
  apiHost:"127.0.0.1",apiPort:32101,
  dashboardHost:"127.0.0.1",dashboardPort:32102,
  dedicatedVm:true,vmName:own,
  vmUuid:"00000000-0000-4000-8000-000000000014",
  apiBundleSha256:"a".repeat(64),schemaMigrations:96,postgresVersion:"17.10",
  migrationChecksumsVerified:true,runtimeRoleAttested:true,
  exclusiveOwnership:true,targetPathOnD:true,
  runtimeRole:"issue300_r2_w7_acceptance_runtime",
  fixtureRole:"issue300_r2_w7_acceptance_owner",
};
const manifest={candidateSha:sha,leaseId:lease,resource,lease:{
  id:lease,owner:"W8",exclusive:true,
  issuedAt:new Date(Date.now()-5000).toISOString(),
  expiresAt:new Date(Date.now()+60_000).toISOString(),
}};
const env={NODE_ENV:"test",ISSUE300_W8_ENABLE:"EXCLUSIVE_TEST_ONLY",
  ISSUE300_R2_CANDIDATE_SHA:sha,ISSUE300_W8_EXCLUSIVE_LEASE:lease,
  ISSUE300_W8_SINGLE_HEAVY_LEASE:"GRANTED",
  ISSUE300_W8_CAPACITY_ATTESTED:"TRUE"};
const observed={Id:resource.containerId,Name:"/"+own,
  State:{Running:true},
  Config:{Image:"postgres:17.10",Labels:{
    "com.vaylet.task":"issue300-r2-w7-acceptance",
    "com.vaylet.volume":resource.volumeId,
  }},
  NetworkSettings:{Ports:{"5432/tcp":[
    {HostIp:"127.0.0.1",HostPort:"58411"}]}},
  Mounts:[{Type:"bind",Source:dataPath,
    Destination:"/var/lib/postgresql/data",RW:true}],
};

test("exact owned W7 accept target (no human DB) is accepted",()=>{
  assert.equal(assertTargetManifest(manifest,env,observed),manifest);
  assert.equal(assertOwnedUri("postgresql://"+
    resource.runtimeRole+":secret@127.0.0.1:58411/"+
    resource.database,manifest,"db").port,"58411");
});
test("foreign/legacy/prod target and port never accepted",()=>{
  for(const port of [57285,55480,58385,3165,3114,5432]){
    assert.throws(()=>assertTargetManifest({
      ...manifest,resource:{...resource,dbPort:port}},env));
  }
  assert.throws(()=>assertTargetManifest({
    ...manifest,resource:{...resource,dataPath:"C:\\shared\\"}},env));
  assert.throws(()=>assertTargetManifest(manifest,{...env,NODE_ENV:"production"}));
  assert.throws(()=>assertTargetManifest(manifest,env,{
    ...observed,Id:"c".repeat(64)}));
  assert.throws(()=>assertTargetManifest(manifest,env,{
    ...observed,Mounts:[{Type:"bind",Source:"C:\\human\\"}]}));
  assert.throws(()=>assertTargetManifest(manifest,env,{
    ...observed,Mounts:[{Type:"bind",Source:dataPath+"other",
      Destination:"/var/lib/postgresql/data",RW:true}]}));
  assert.throws(()=>assertTargetManifest(manifest,env,{
    ...observed,Mounts:[{Type:"bind",Source:dataPath,
      Destination:"/var/lib/postgresql/data",RW:false}]}));
  assert.throws(()=>assertOwnedUri(
    "postgresql://alice:secret@127.0.0.1:57285/issue300_r2",
    manifest,"db"));
});
test("U004 deterministic tiers cannot be silently reduced",()=>{
  assert.deepEqual(fixturePlan(100_000).targetCounts,{
    AUDIT:25_000,KEY_CUSTODY:25_000,DISPATCH:25_000,INCIDENT:25_000});
  assert.equal(fixturePlan(1_000_000).sessions,10_000);
  assert.throws(()=>fixturePlan(10_000));
  for(const k of ["AUDIT","KEY_CUSTODY","DISPATCH","INCIDENT"]){
    const sql=fixtureStatement(k);
    assert(sql.includes("generate_series("));
    assert(sql.includes("INSERT INTO "));
    assert(sql.includes("$7::int"));
    assert(sql.includes("$8::int"));
  }
  assert.throws(()=>fixtureStatement("FAKE_WRITER"));
});
test("exact real writer roster must be separate scoped clients",()=>{
  const uuid=(last)=>"10000000-0000-4000-8000-0000000000"+last;
  const scope={organizationId:uuid("11"),locationId:uuid("12")};
  const mk=(i)=>({clientId:"writer-"+String(i).padStart(3,"0"),
    sessionId:uuid(String(i).padStart(2,"0")),
    membershipId:uuid("13"),bearer:"vsa1."+"A".repeat(43),
    command:"INCIDENT_REPORT",organizationId:scope.organizationId,
    locationId:scope.locationId});
  const roster=[mk(1),mk(2)];
  assert.equal(assertWriterRoster(roster,{scope},2).length,2);
  assert.throws(()=>assertWriterRoster([roster[0],roster[0]],{scope},2));
  assert.throws(()=>assertWriterRoster(roster,{scope},8));
  assert.throws(()=>assertWriterRoster([{...mk(1),
    command:"DIRECT_SQL"},mk(2)],{scope},2));
});
test("guest cold proof rejects same boot and stale certification",()=>{
  const old="00000000-0000-4000-8000-000000000001";
  const next="00000000-0000-4000-8000-000000000002";
  const when=Date.now();
  const boot={bootId:next,vmUuid:resource.vmUuid,
    recordedAt:new Date(when+100).toISOString(),
    apiReady:true,postgresStartedAt:new Date(when).toISOString()};
  assert.doesNotThrow(()=>verifyColdBoot(old,boot,resource.vmUuid,when));
  assert.throws(()=>verifyColdBoot(next,boot,resource.vmUuid,when));
  assert.throws(()=>verifyColdBoot(old,{...boot,
    recordedAt:new Date(when-1000).toISOString()},resource.vmUuid,when));
  const signed={...boot,pgContainerId:resource.containerId,
    provenance:"OWNED_GUEST_SIGNED_KERNEL_BOOT_ID",candidateSha:sha,
    leaseId:lease,apiBundleSha256:resource.apiBundleSha256,
    apiPort:resource.apiPort,postgresVersion:"17.10",
    osKernelBootVerified:true,pgProcessStartedAfterBoot:true};
  assertSignedGuestBoot(signed,{candidateSha:sha,leaseId:lease,
    resource},when);
  assert.throws(()=>assertSignedGuestBoot({...signed,
    apiPort:3114},{candidateSha:sha,leaseId:lease,resource},when));
  assert.throws(()=>assertSignedGuestBoot({...signed,
    pgContainerId:"d".repeat(64)},{candidateSha:sha,leaseId:lease,resource},when));
});
test("canonical SQL plans come from current Search and Timeline source",async()=>{
  const sid="10000000-0000-4000-8000-000000000011";
  const m={planProbe:{
    from:"2026-10-16T11:00:00Z",to:"2026-10-16T12:00:00Z",
    sessionId:sid,detailSource:"INCIDENT",detailId:sid,
    knownAuditTypes:["VALET_SESSION_PARKED","INCIDENT_OPENED"],
  }};
  const statements=await canonicalSql({
    organizationId:"10000000-0000-4000-8000-000000000012",
    locationId:"10000000-0000-4000-8000-000000000013",
  },{now:new Date("2026-10-18T11:00:00Z"),
    cutoff:"2026-10-18T11:00:00.123456Z",database:"1:2:"},m);
  assert.equal(statements.length,3);
  assert.match(statements[0].sql,/WITH scoped_location|WITH\s+scoped_location/);
  assert.match(statements[1].sql,/WITH scoped AS MATERIALIZED/);
  assert.equal(statements[1].sql,statements[2].sql);
  assert.equal(statements[0].params.length,17);
  assert.equal(statements[1].params.length,11);
  assert.equal(statements[0].params[8],"2026-10-18T11:00:00.123456Z");
  assert.equal(statements[0].params[9],"1:2:");
  assert.equal(statements[1].params[6],"1:2:");
  assert.equal(statements[1].params[7],"2026-10-18T11:00:00.123456Z");
  await assert.rejects(()=>canonicalSql({
    organizationId:"10000000-0000-4000-8000-000000000012",
    locationId:"10000000-0000-4000-8000-000000000013",
  },{now:new Date(),snapshot:"1:2:"},m));
});
const sourceId="10000000-0000-4000-8000-000000000031";
const sessionId="10000000-0000-4000-8000-000000000032";
const org="10000000-0000-4000-8000-000000000033";
const loc="10000000-0000-4000-8000-000000000034";
const expected={
  search:{sessionId,source:"AUDIT",eventId:sourceId},
  timeline:{sessionId,source:"AUDIT",eventId:sourceId},
  detail:{sessionId,source:"AUDIT",eventId:sourceId},
};
const base=`/v1/staff/management/organizations/${org}/locations/${loc}/audit-investigations`;
const routes={
  search:`${base}/sessions?from=2026-10-16T11:00:00Z&to=2026-10-16T12:00:00Z&sessionId=${sessionId}&limit=100`,
  timeline:`${base}/sessions/${sessionId}/timeline?limit=100`,
  detail:`${base}/sessions/${sessionId}/events/AUDIT/${sourceId}`,
};
test("signed expected IDs reject HTTP200 with empty or unrelated data",()=>{
  const source={expected};
  assert.deepEqual(verifyPinnedRoutes(routes,{
    scope:{organizationId:org,locationId:loc},
  },source),routes);
  assert.throws(()=>verifyPinnedRoutes({...routes,search:
    `${base}/filters?kind=MEMBER`},{scope:{
      organizationId:org,locationId:loc}},source));
  assert.throws(()=>verifyPinnedRoutes({...routes,detail:
    `${base}/sessions/${sessionId}/events/AUDIT/${sessionId}`},{
    scope:{organizationId:org,locationId:loc}},source));
  assert.throws(()=>verifyPinnedRoutes({...routes,search:
    routes.search+"&includeAll=true"},{scope:{
      organizationId:org,locationId:loc}},source));
  assert.throws(()=>assertExpectedHttp("search",{items:[],
    snapshotAt:"x"},source));
  assert.throws(()=>assertExpectedHttp("timeline",{items:[{key:{
    source:"AUDIT",eventId:sessionId}}],snapshotAt:"x"},source));
  assert.throws(()=>assertExpectedHttp("detail",{sessionId,source:"AUDIT",
    key:{source:"AUDIT",eventId:sessionId}},source));
  assertExpectedHttp("search",{items:[{sessionId,matchingRecordCount:1,
    matchReasons:[{source:"AUDIT",eventId:sourceId}]}],snapshotAt:"x"},source);
  assertExpectedHttp("timeline",{items:[{key:{source:"AUDIT",
    eventId:sourceId}}],snapshotAt:"x"},source);
  assertExpectedHttp("detail",{sessionId,source:"AUDIT",
    key:{source:"AUDIT",eventId:sourceId}},source);
});
test("zero-row EXPLAIN cannot masquerade as performance proof",()=>{
  const rows=[{sessionId,matchingRecordCount:2}];
  assert.throws(()=>assertNonemptyPlan({Plan:{"Actual Rows":0}},rows,
    "search",expected));
  assert.throws(()=>assertNonemptyPlan({Plan:{"Actual Rows":1}},[],
    "search",expected));
  assert.throws(()=>assertNonemptyPlan({Plan:{"Actual Rows":1}},[
    {sessionId,matchingRecordCount:0}],"search",expected));
  assertNonemptyPlan({Plan:{"Actual Rows":1}},rows,"search",expected);
  assert.throws(()=>assertNonemptyPlan({Plan:{"Actual Rows":1}},
    [{source:"AUDIT",id:sessionId}],"detail",expected));
});
test("independent source oracle signature and runtime listener are mandatory",()=>{
  const work=join(process.cwd(),"tmp");
  mkdirSync(work,{recursive:true});
  const directory=mkdtempSync(join(work,"w8-sign-"));
  try {
    const {publicKey,privateKey}=generateKeyPairSync("ed25519");
    const publicBytes=publicKey.export({type:"spki",format:"pem"});
    const fingerprint=createHash("sha256").update(publicKey.export({
      type:"spki",format:"der"})).digest("hex");
    const sourceFixtureHash="c".repeat(64);
    const m={candidateSha:sha,leaseId:lease,sourceFixtureHash,
      oracleIssuerKeySha256:fingerprint,targetTier:100000,
      resource:{...resource,dataPath:directory+"/"}};
    const payload={provenance:"INDEPENDENT_SOURCE_DB_READ_ONLY",
      candidateSha:sha,leaseId:lease,sourceFixtureHash,
      database:resource.database,containerId:resource.containerId,
      targetTier:100000,sourceCounts:{
        AUDIT:25000,KEY_CUSTODY:25000,DISPATCH:25000,INCIDENT:25000},
      apiRuntime:{kind:"OWNED_GUEST_RUNTIME_LISTENER_ATTESTATION",
        host:"127.0.0.1",port:resource.apiPort,apiBundleSha256:
          resource.apiBundleSha256,containerId:resource.containerId,
        vmUuid:resource.vmUuid,listenerProbed:true,apiPid:4321,
        probedAt:new Date().toISOString(),
        processStartedAt:new Date(Date.now()-5000).toISOString()},
      expected};
    const key=join(directory,"public.pem");
    const data=join(directory,"evidence.json");
    const signature=join(directory,"evidence.sig");
    writeFileSync(key,publicBytes);
    const content=Buffer.from(JSON.stringify(payload));
    writeFileSync(data,content);
    writeFileSync(signature,sign(null,content,privateKey));
    const env={ISSUE300_W8_ORACLE_KEY:key,
      ISSUE300_W8_ORACLE_JSON:data,ISSUE300_W8_ORACLE_SIGNATURE:signature,
      ISSUE300_W8_TRUSTED_ORACLE_KEY_SHA256:fingerprint};
    assert.equal(verifiedSourceOracle(m,env).expected.search.sessionId,sessionId);
    assert.throws(()=>verifiedSourceOracle(m,{...env,
      ISSUE300_W8_TRUSTED_ORACLE_KEY_SHA256:"0".repeat(64)}));
    writeFileSync(data,JSON.stringify({...payload,
      expected:{...expected,search:{...expected.search,eventId:sessionId}}}));
    assert.throws(()=>verifiedSourceOracle(m,env),
      /signature failed/);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
