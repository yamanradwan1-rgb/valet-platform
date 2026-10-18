// Cold p95 must come from independent signed HTTP observation, not self-claims.
import assert from "node:assert/strict";
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

const sha256=(bytes)=>createHash("sha256").update(bytes).digest("hex");

export function verifySignedColdTrial(trial,m,oracle,endpoint,boot,env=process.env){
  const path=realpathSync(env.ISSUE300_W8_COLD_TRIAL_PUBLIC_KEY);
  assert(path.toLowerCase().startsWith(
    (resolve(m.resource.dataPath)+sep).toLowerCase()),
  "Independent trial key must be in owned D-drive folder");
  const key=createPublicKey(readFileSync(path));
  assert.equal(key.asymmetricKeyType,"ed25519");
  const fingerprint=sha256(key.export({type:"spki",format:"der"}));
  assert.equal(fingerprint,m.coldTrialIssuerKeySha256);
  assert.equal(fingerprint,env.ISSUE300_W8_TRUSTED_COLD_TRIAL_KEY_SHA256);
  const bytes=Buffer.from(trial.signedTrialPayloadBase64??"","base64");
  const signature=Buffer.from(trial.signedTrialSignatureBase64??"","base64");
  assert(bytes.length>0 && signature.length===64);
  assert(verify(null,bytes,key,signature),"Forged/absent signed HTTP cold trial");
  const r=JSON.parse(bytes.toString("utf8"));
  const expected=oracle.expected[endpoint];
  assert.equal(r.provenance,"INDEPENDENT_GUEST_HTTP_TIMING_OBSERVER");
  assert.equal(r.endpoint,endpoint);
  assert.equal(r.requestPath,m.endpoints[endpoint]);
  assert.equal(r.requestMethod,"GET");
  assert.equal(r.httpStatus,200);
  assert.equal(r.responseValidated,true);
  assert.equal(r.candidateSha,m.candidateSha);
  assert.equal(r.leaseId,m.leaseId);
  assert.equal(r.targetTier,m.targetTier);
  assert.equal(r.sourceFixtureHash,m.sourceFixtureHash);
  assert.equal(r.containerId,m.resource.containerId);
  assert.equal(r.apiBundleSha256,m.resource.apiBundleSha256);
  assert.equal(r.vmUuid,m.resource.vmUuid);
  assert.equal(r.apiPid,boot.apiPid);
  assert.equal(r.apiProcessStartedAt,boot.apiProcessStartedAt);
  assert.equal(r.bootId,boot.bootId);
  assert.equal(r.resetIssuedAt,trial.resetIssuedAt);
  assert.equal(r.expectedSessionId,expected.sessionId);
  assert.equal(r.expectedSource,expected.source);
  assert.equal(r.expectedEventId,expected.eventId);
  assert.equal(r.responseSha256,trial.responseSha256);
  assert.equal(r.httpElapsedMs,trial.httpElapsedMs);
  const begin=Date.parse(r.requestStartedAt);
  const end=Date.parse(r.responseFinishedAt);
  assert(Number.isFinite(begin) && Number.isFinite(end));
  assert(Date.parse(r.resetIssuedAt)<Date.parse(boot.recordedAt));
  assert(begin>=Date.parse(boot.recordedAt) && end>=begin);
  assert(Number.isFinite(r.httpElapsedMs) && r.httpElapsedMs>=0);
  assert(Math.abs((end-begin)-r.httpElapsedMs)<=100,
    "Observer HTTP duration inconsistent with signed timestamps");
  assert(Number.isFinite(trial.localHttpElapsedMs) &&
    Math.abs(trial.localHttpElapsedMs-r.httpElapsedMs)<=
      Math.max(100,trial.localHttpElapsedMs*.1),
    "Independent cold measurement disagrees with local clock");
  return r;
}
