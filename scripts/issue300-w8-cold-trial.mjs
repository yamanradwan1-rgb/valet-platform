// Cold p95 covers the full OS reset, API boot and first validated HTTP response.
import assert from "node:assert/strict";
import { verify } from "node:crypto";
import { verifyProducerKeyFile } from "./issue300-w8-owner-root.mjs";

export function verifySignedColdTrial(trial,m,oracle,endpoint,boot,env=process.env){
  assert(!env.ISSUE300_W8_TRUSTED_COLD_TRIAL_KEY_SHA256 ||
    env.ISSUE300_W8_TRUSTED_COLD_TRIAL_KEY_SHA256===
      m.coldTrialIssuerKeySha256);
  const key=verifyProducerKeyFile(env.ISSUE300_W8_COLD_TRIAL_PUBLIC_KEY,
    m.coldTrialIssuerKeySha256,m.resource.dataPath);
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
  assert.equal(r.coldElapsedMs,trial.coldElapsedMs);
  const reset=Date.parse(r.resetIssuedAt);
  const begin=Date.parse(r.requestStartedAt);
  const end=Date.parse(r.responseFinishedAt);
  assert(Number.isFinite(reset) && Number.isFinite(begin) &&
    Number.isFinite(end));
  assert(reset<Date.parse(boot.recordedAt));
  assert(begin>=Date.parse(boot.recordedAt) && end>=begin);
  assert(Number.isFinite(r.coldElapsedMs) && r.coldElapsedMs>=0);
  assert(Math.abs((end-reset)-r.coldElapsedMs)<=100,
    "Signed cold duration excludes reset/boot or disagrees with timestamps");
  assert(r.coldElapsedMs>=r.httpElapsedMs,
    "Signed cold duration cannot be less than HTTP alone");
  assert(Number.isFinite(r.httpElapsedMs) && r.httpElapsedMs>=0);
  assert(Math.abs((end-begin)-r.httpElapsedMs)<=100,
    "Observer HTTP duration inconsistent with signed timestamps");
  assert(Number.isFinite(trial.localHttpElapsedMs) &&
    Math.abs(trial.localHttpElapsedMs-r.httpElapsedMs)<=
      Math.max(100,trial.localHttpElapsedMs*.1),
    "Independent cold measurement disagrees with local clock");
  assert(Number.isFinite(trial.localColdElapsedMs) &&
    trial.localColdElapsedMs>=trial.localHttpElapsedMs);
  assert(Math.abs(trial.localColdElapsedMs-r.coldElapsedMs)<=
    Math.max(300,trial.localColdElapsedMs*.1),
    "Independent whole-cold timing disagrees with reset-start monotonic clock");
  return r;
}
