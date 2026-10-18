import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verifyColdArtifact } from "./issue300-w8-cold.mjs";

test("80 fully signed cold observations; self-asserted fast p95 fails",()=>{
  const parent=join(process.cwd(),"tmp");
  mkdirSync(parent,{recursive:true});
  const folder=mkdtempSync(join(parent,"w8-cold-"));
  try {
    const bootSigner=generateKeyPairSync("ed25519");
    const trialSigner=generateKeyPairSync("ed25519");
    const bootKey=join(folder,"boot.pem");
    const trialKey=join(folder,"trial.pem");
    const fingerprint=(key)=>createHash("sha256").update(key.export({
      type:"spki",format:"der"})).digest("hex");
    writeFileSync(bootKey,bootSigner.publicKey.export({type:"spki",format:"pem"}));
    writeFileSync(trialKey,trialSigner.publicKey.export({type:"spki",format:"pem"}));
    const candidateSha="a".repeat(40),leaseId="issue300-r2-w8-test-123456";
    const containerId="b".repeat(64),bundle="c".repeat(64);
    const vmUuid="00000000-0000-4000-8000-000000000014";
    const sourceId="10000000-0000-4000-8000-000000000021";
    const sessionId="10000000-0000-4000-8000-000000000022";
    const endpoints=["search","busySlotSearch","timeline","detail"];
    const paths=Object.fromEntries(endpoints.map((k)=>[k,"/v1/staff/management/"+k]));
    const expected=Object.fromEntries(endpoints.map((k)=>[k,{
      sessionId,source:"AUDIT",eventId:sourceId}]));
    const m={candidateSha,leaseId,targetTier:100000,
      sourceFixtureHash:"f".repeat(64),
      guestBootIssuerKeySha256:fingerprint(bootSigner.publicKey),
      coldTrialIssuerKeySha256:fingerprint(trialSigner.publicKey),
      endpoints:paths,resource:{dataPath:folder+"/",vmUuid,containerId,
        apiBundleSha256:bundle,apiPort:32101,postgresVersion:"17.10"}};
    const env={ISSUE300_W8_GUEST_BOOT_KEY:bootKey,
      ISSUE300_W8_TRUSTED_GUEST_BOOT_KEY_SHA256:m.guestBootIssuerKeySha256,
      ISSUE300_W8_COLD_TRIAL_PUBLIC_KEY:trialKey,
      ISSUE300_W8_TRUSTED_COLD_TRIAL_KEY_SHA256:m.coldTrialIssuerKeySha256};
    const trials=Object.fromEntries(endpoints.map((k)=>[k,[]]));
    let i=0;
    for(const endpoint of endpoints)for(let j=1;j<=20;j++){
      const id=String(++i).padStart(12,"0");
      const reset=new Date(Date.now()-5000).toISOString();
      const recordedAt=new Date(Date.now()-2000).toISOString();
      const boot={bootId:`00000000-0000-4000-8000-${id}`,vmUuid,
        pgContainerId:containerId,apiReady:true,apiPid:4321,
        apiProcessStartedAt:new Date(Date.now()-3500).toISOString(),
        provenance:"OWNED_GUEST_SIGNED_KERNEL_BOOT_ID",candidateSha,leaseId,
        targetTier:100000,sourceFixtureHash:m.sourceFixtureHash,
        apiBundleSha256:bundle,apiPort:32101,postgresVersion:"17.10",
        osKernelBootVerified:true,pgProcessStartedAfterBoot:true,
        postgresStartedAt:new Date(Date.now()-3000).toISOString(),recordedAt};
      const payload=Buffer.from(JSON.stringify(boot));
      const responseSha256="d".repeat(64);
      const observer={
        provenance:"INDEPENDENT_GUEST_HTTP_TIMING_OBSERVER",
        endpoint,requestPath:paths[endpoint],requestMethod:"GET",
        httpStatus:200,responseValidated:true,candidateSha,leaseId,
        targetTier:100000,sourceFixtureHash:m.sourceFixtureHash,
        containerId,apiBundleSha256:bundle,vmUuid,apiPid:4321,
        apiProcessStartedAt:boot.apiProcessStartedAt,bootId:boot.bootId,
        resetIssuedAt:reset,expectedSessionId:sessionId,
        expectedSource:"AUDIT",expectedEventId:sourceId,
        responseSha256,httpElapsedMs:30,
        requestStartedAt:new Date(Date.now()-1000).toISOString(),
        responseFinishedAt:new Date(Date.now()-970).toISOString(),
      };
      const observerBytes=Buffer.from(JSON.stringify(observer));
      trials[endpoint].push({trial:j,guestBootId:boot.bootId,
        guestBootEvidenceAt:recordedAt,resetIssuedAt:reset,
        signedBootPayloadBase64:payload.toString("base64"),
        signedBootSignatureBase64:sign(null,payload,bootSigner.privateKey)
          .toString("base64"),
        signedTrialPayloadBase64:observerBytes.toString("base64"),
        signedTrialSignatureBase64:sign(null,observerBytes,trialSigner.privateKey)
          .toString("base64"),
        httpElapsedMs:30,localHttpElapsedMs:30,responseSha256,
        cacheResetVerified:true,responseValidated:true});
    }
    const oracle={expected};
    const cold={methodology:"OWNED_GUEST_INDEPENDENT_OS_BOOT_ID",
      globalSharedCacheFlush:false,trials};
    assert.equal(verifyColdArtifact(cold,m,oracle,env),true);
    const first=trials.busySlotSearch[0];
    const signature=first.signedTrialSignatureBase64;
    first.signedTrialSignatureBase64=Buffer.alloc(64).toString("base64");
    assert.throws(()=>verifyColdArtifact(cold,m,oracle,env));
    first.signedTrialSignatureBase64=signature;
    first.httpElapsedMs=1;
    assert.throws(()=>verifyColdArtifact(cold,m,oracle,env));
    first.httpElapsedMs=30;
    first.localHttpElapsedMs=1_000;
    assert.throws(()=>verifyColdArtifact(cold,m,oracle,env));
    first.localHttpElapsedMs=30;
    assert.throws(()=>verifyColdArtifact({...cold,trials:{
      ...trials,busySlotSearch:[]}},m,oracle,env));
    assert.throws(()=>verifyColdArtifact({...cold,trials:{
      ...trials,detail:[...trials.detail.slice(0,19),trials.search[0]]}},
    m,oracle,env));
  } finally {rmSync(folder,{recursive:true,force:true});}
});
