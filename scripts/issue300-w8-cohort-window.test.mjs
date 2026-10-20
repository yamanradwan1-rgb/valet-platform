import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fixtureStatement } from "./issue300-w8-fixture.mjs";
import { assertCompleteCohortWindow, assertWindowSourceCohort,
  fixtureFirstAt, fixtureLastAt } from "./issue300-w8-cohort-window.mjs";
import { verifiedSourceOracle } from "./issue300-w8-http-evidence.mjs";

const sha256=(bytes)=>createHash("sha256").update(bytes).digest("hex");
const sessionId="10000000-0000-4000-8000-000000000032";
const sourceId="10000000-0000-4000-8000-000000000031";
const slotId="10000000-0000-4000-8000-000000000035";
const fullWindow={from:"2026-10-16T11:00:00Z",
  to:"2026-10-16T12:00:00Z"};
const sourceCounts={AUDIT:25000,KEY_CUSTODY:25000,
  DISPATCH:25000,INCIDENT:25000};
const busySlot={keySlotId:slotId,source:"KEY_CUSTODY",
  persistedCustodyRows:25000,distinctSessions:1000};

test("60 UTC fixture seconds included by every U004 signed Search window",()=>{
  assert.equal(fixtureFirstAt,"2026-10-16T11:30:00Z");
  assert.equal(fixtureLastAt,"2026-10-16T11:30:59Z");
  assert.deepEqual(assertCompleteCohortWindow(fullWindow),fullWindow);
  assert.equal(assertWindowSourceCohort(sourceCounts,busySlot,100000),true);
  for(const kind of Object.keys(sourceCounts))
    assert(fixtureStatement(kind).includes(fixtureFirstAt));
  for(const window of [
    {from:fixtureFirstAt,to:"2026-10-16T11:30:01Z"},
    {from:"2026-10-16T11:30:01Z",to:"2026-10-16T11:31:00Z"},
    {from:"2026-10-16T11:29:00Z",to:"2026-10-16T11:30:58Z"},
  ]) assert.throws(()=>assertCompleteCohortWindow(window),
    /excludes fixture source seconds/);
  assert.throws(()=>assertWindowSourceCohort({
    ...sourceCounts,INCIDENT:500},busySlot,100000),
  /in-window source cohort is incomplete/);
  assert.throws(()=>assertWindowSourceCohort(sourceCounts,{
    ...busySlot,persistedCustodyRows:500,distinctSessions:20},100000),
  /busy slot in-window custody cohort incomplete/);
  assert.throws(()=>assertWindowSourceCohort(sourceCounts,busySlot,1000000));
});

test("independently signed cohort window and counts pinned to Owner source bytes",()=>{
  const parent=join(process.cwd(),"tmp");
  mkdirSync(parent,{recursive:true});
  const folder=mkdtempSync(join(parent,"w8-source-cohort-"));
  try{
    const {publicKey,privateKey}=generateKeyPairSync("ed25519");
    const key=join(folder,"public.pem");
    const data=join(folder,"oracle.json");
    const signature=join(folder,"oracle.sig");
    writeFileSync(key,publicKey.export({type:"spki",format:"pem"}));
    const fingerprint=sha256(publicKey.export({type:"spki",format:"der"}));
    const candidateSha="a".repeat(40),leaseId="issue300-r2-w8-test-123456";
    const sourceFixtureHash="f".repeat(64);
    const containerId="b".repeat(64),apiBundleSha256="c".repeat(64);
    const vmUuid="00000000-0000-4000-8000-000000000014";
    const expected={
      search:{sessionId,source:"AUDIT",eventId:sourceId},
      busySlotSearch:{sessionId,source:"KEY_CUSTODY",eventId:sourceId,
        keySlotId:slotId},
      timeline:{sessionId,source:"AUDIT",eventId:sourceId},
      detail:{sessionId,source:"AUDIT",eventId:sourceId},
    };
    const payload={provenance:"INDEPENDENT_SOURCE_DB_READ_ONLY",
      candidateSha,leaseId,sourceFixtureHash,
      workloadWindow:fullWindow,sourceCounts,
      windowSourceCounts:{...sourceCounts},
      windowSlotSkew:{...busySlot},skew:{busySlot},
      targetTier:100000,database:"issue300_r2_w7_acceptance_test",
      containerId,expected,
      writerCohorts:{
        2:{rosterDigest:"d".repeat(64),clientIds:["w1","w2"],
          commandMix:{INCIDENT_REPORT:1,KEY_SLOT_ASSIGN:1}},
        8:{rosterDigest:"e".repeat(64),
          clientIds:["w1","w2","w3","w4","w5","w6","w7","w8"],
          commandMix:{INCIDENT_REPORT:4,KEY_SLOT_ASSIGN:4}}},
      apiRuntime:{kind:"OWNED_GUEST_RUNTIME_LISTENER_ATTESTATION",
        host:"127.0.0.1",port:32101,apiBundleSha256,containerId,
        vmUuid,listenerProbed:true,apiPid:4321,
        processStartedAt:new Date(Date.now()-5000).toISOString(),
        probedAt:new Date().toISOString()}};
    const issue=(content)=>{
      const bytes=Buffer.from(JSON.stringify(content));
      writeFileSync(data,bytes);
      writeFileSync(signature,sign(null,bytes,privateKey));
      return sha256(bytes);
    };
    const m={candidateSha,leaseId,sourceFixtureHash,
      oracleIssuerKeySha256:fingerprint,targetTier:100000,
      planProbe:{...fullWindow},scope:{slotId},
      resource:{dataPath:folder+"/",database:payload.database,containerId,
        apiBundleSha256,vmUuid,apiPort:32101}};
    m.sourceOracleSha256=issue(payload);
    const env={ISSUE300_W8_ORACLE_KEY:key,
      ISSUE300_W8_ORACLE_JSON:data,ISSUE300_W8_ORACLE_SIGNATURE:signature};
    assert.equal(verifiedSourceOracle(m,env).windowSourceCounts.INCIDENT,25000);
    const truncated={...payload,
      workloadWindow:{from:fixtureFirstAt,to:"2026-10-16T11:30:01Z"}};
    m.sourceOracleSha256=issue(truncated);
    m.planProbe={...truncated.workloadWindow};
    assert.throws(()=>verifiedSourceOracle(m,env),
      /excludes fixture source seconds/);
    m.planProbe={...fullWindow};
    m.sourceOracleSha256=issue({...payload,windowSourceCounts:{
      ...sourceCounts,DISPATCH:500}});
    assert.throws(()=>verifiedSourceOracle(m,env),
      /in-window source counts must match full fixture cohort/);
    m.sourceOracleSha256=issue({...payload,windowSlotSkew:{
      ...busySlot,persistedCustodyRows:500}});
    assert.throws(()=>verifiedSourceOracle(m,env),
      /busy-slot window must match whole busy-slot cohort/);
    m.sourceOracleSha256=issue(payload);
    issue({...payload,expected:{...expected,search:{
      ...expected.search,eventId:sessionId}}});
    assert.throws(()=>verifiedSourceOracle(m,env),
      /differ from Prime Owner manifest/);
    const foreignSigner=generateKeyPairSync("ed25519");
    writeFileSync(key,foreignSigner.publicKey.export({
      type:"spki",format:"pem"}));
    assert.throws(()=>verifiedSourceOracle(m,env),
      /not signed into Prime Owner manifest/);
  }finally{rmSync(folder,{recursive:true,force:true});}
});
