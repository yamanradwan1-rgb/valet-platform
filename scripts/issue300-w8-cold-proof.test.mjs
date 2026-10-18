import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verifyColdArtifact } from "./issue300-w8-cold.mjs";

test("60 signed distinct guest boots mandatory, booleans cannot fake cold",()=>{
  const parent=join(process.cwd(),"tmp");
  mkdirSync(parent,{recursive:true});
  const folder=mkdtempSync(join(parent,"w8-cold-"));
  try {
    const {publicKey,privateKey}=generateKeyPairSync("ed25519");
    const pem=join(folder,"guest.pem");
    writeFileSync(pem,publicKey.export({type:"spki",format:"pem"}));
    const fingerprint=createHash("sha256").update(publicKey.export({
      type:"spki",format:"der"})).digest("hex");
    const candidateSha="a".repeat(40),leaseId="issue300-r2-w8-test-123456";
    const containerId="b".repeat(64),bundle="c".repeat(64);
    const vmUuid="00000000-0000-4000-8000-000000000014";
    const m={candidateSha,leaseId,guestBootIssuerKeySha256:fingerprint,
      resource:{dataPath:folder+"/",vmUuid,containerId,
        apiBundleSha256:bundle,apiPort:32101,postgresVersion:"17.10"}};
    const env={ISSUE300_W8_GUEST_BOOT_KEY:pem,
      ISSUE300_W8_TRUSTED_GUEST_BOOT_KEY_SHA256:fingerprint};
    const trials={search:[],timeline:[],detail:[]};
    let i=0;
    for(const endpoint of Object.keys(trials))
      for(let trial=1;trial<=20;trial++){
        const id=String(++i).padStart(12,"0");
        const resetIssuedAt=new Date(Date.now()-5000).toISOString();
        const boot={bootId:`00000000-0000-4000-8000-${id}`,
          vmUuid,pgContainerId:containerId,apiReady:true,
          provenance:"OWNED_GUEST_SIGNED_KERNEL_BOOT_ID",
          candidateSha,leaseId,apiBundleSha256:bundle,apiPort:32101,
          postgresVersion:"17.10",osKernelBootVerified:true,
          pgProcessStartedAfterBoot:true,
          postgresStartedAt:new Date(Date.now()-1000).toISOString(),
          recordedAt:new Date().toISOString()};
        const bytes=Buffer.from(JSON.stringify(boot));
        trials[endpoint].push({guestBootId:boot.bootId,
          guestBootEvidenceAt:boot.recordedAt,resetIssuedAt,
          cacheResetVerified:true,responseValidated:true,httpElapsedMs:30,
          signedBootPayloadBase64:bytes.toString("base64"),
          signedBootSignatureBase64:sign(null,bytes,privateKey).toString("base64")});
      }
    const cold={methodology:"OWNED_GUEST_INDEPENDENT_OS_BOOT_ID",
      globalSharedCacheFlush:false,trials};
    assert.equal(verifyColdArtifact(cold,m,env),true);
    const first=trials.search[0];
    const original=first.signedBootSignatureBase64;
    first.signedBootSignatureBase64=Buffer.alloc(64).toString("base64");
    assert.throws(()=>verifyColdArtifact(cold,m,env),/signed independent guest boot/);
    first.signedBootSignatureBase64=original;
    const old=first.guestBootId;
    first.guestBootId=trials.timeline[0].guestBootId;
    assert.throws(()=>verifyColdArtifact(cold,m,env));
    first.guestBootId=old;
    assert.throws(()=>verifyColdArtifact({
      ...cold,trials:{...trials,detail:trials.detail.map((t)=>({
        ...t,signedBootPayloadBase64:null,signedBootSignatureBase64:null,
      }))}},m,env));
    assert.throws(()=>verifyColdArtifact({...cold,
      trials:{...trials,detail:trials.detail.slice(1)}},m,env));
  } finally {rmSync(folder,{recursive:true,force:true});}
});
