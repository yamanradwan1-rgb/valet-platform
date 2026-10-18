import test from "node:test";
import assert from "node:assert/strict";
import { assertTargetManifest, assertOwnedUri } from "./issue300-w8-target.mjs";
import { fixturePlan, fixtureStatement } from "./issue300-w8-fixture.mjs";
import { assertWriterRoster } from "./issue300-w8-writer-clients.mjs";
import { verifyColdBoot } from "./issue300-w8-cold.mjs";
import { canonicalSql } from "./issue300-w8-plans.mjs";

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
  Mounts:[{Type:"bind",Source:dataPath}],
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
  },{now:new Date("2026-10-18T11:00:00Z"),snapshot:"1:1:"},m);
  assert.equal(statements.length,3);
  assert.match(statements[0].sql,/WITH scoped_location|WITH\s+scoped_location/);
  assert.match(statements[1].sql,/WITH scoped AS MATERIALIZED/);
  assert.equal(statements[1].sql,statements[2].sql);
  assert.equal(statements[0].params.length,17);
  assert.equal(statements[1].params.length,11);
});
