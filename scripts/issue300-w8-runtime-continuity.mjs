// Independent signed guest process samples throughout each 600s HTTP phase.
import assert from "node:assert/strict";
import { verifyDetachedBytes } from "./issue300-w8-http-evidence.mjs";

export function assertRuntimeSample(sample,m,oracle,now=Date.now()) {
  const original=oracle.apiRuntime;
  assert.equal(sample.kind,"OWNED_GUEST_API_PROCESS_SAMPLE");
  assert.equal(sample.provenance,"GUEST_PROC_EXEC_HASH_AND_LISTENER");
  assert.equal(sample.candidateSha,m.candidateSha);
  assert.equal(sample.leaseId,m.leaseId);
  assert.equal(sample.targetTier,m.targetTier);
  assert.equal(sample.sourceFixtureHash,m.sourceFixtureHash);
  assert.equal(sample.containerId,m.resource.containerId);
  assert.equal(sample.vmUuid,m.resource.vmUuid);
  assert.equal(sample.port,m.resource.apiPort);
  assert.equal(sample.apiBundleSha256,m.resource.apiBundleSha256);
  assert.equal(sample.apiPid,original.apiPid);
  assert.equal(sample.processStartedAt,original.processStartedAt);
  assert.equal(sample.processAlive,true);
  assert.equal(sample.listenerProbed,true);
  assert.equal(sample.bundleReadFromRunningProcess,true);
  assert(Number.isSafeInteger(sample.sequence) && sample.sequence>=0);
  const at=Date.parse(sample.sampledAt);
  assert(Number.isFinite(at) && at<=now && now-at<45_000,
    "Signed runtime continuity sample absent/stale");
  return at;
}

export function assertRuntimeCheckpointWindow(previousAt,currentAt,maxGapMs=45_000){
  assert(Number.isFinite(currentAt) &&
    (previousAt < 0 || currentAt > previousAt && currentAt-previousAt<=maxGapMs),
  "Missing continuous signed runtime checkpoint window");
}

export function assertRuntimePhaseCoverage(firstAt,lastAt,startedAt,finishedAt,samples){
  const start=Date.parse(startedAt),end=Date.parse(finishedAt);
  assert(Number.isFinite(start) && Number.isFinite(end) &&
    end-start>=600_000 && samples>=20 &&
    firstAt>=start-45_000 && firstAt<=start+10_000 &&
    lastAt>=end-30_000 && lastAt<=end+45_000,
  "Signed runtime evidence does not cover full 600-second phase");
}

export function runtimeContinuity(m,oracle,env=process.env,
  monotonic=()=>performance.now()) {
  const key=env.ISSUE300_W8_RUNTIME_KEY;
  const payload=env.ISSUE300_W8_RUNTIME_JSON;
  const signature=env.ISSUE300_W8_RUNTIME_SIG;
  let lastSequence=-1,lastAt=-1,firstAt=-1,lastCheck=-Infinity;
  let samples=0;
  const collect=()=>{
    const item=verifyDetachedBytes(m,{key,payload,signature},
      m.runtimeIssuerKeySha256,env,
      "ISSUE300_W8_TRUSTED_RUNTIME_KEY_SHA256");
    const at=assertRuntimeSample(item,m,oracle);
    assert(item.sequence>lastSequence && at>lastAt,
      "Runtime checkpoint repeated; process may have been swapped");
    assertRuntimeCheckpointWindow(lastAt,at);
    if(firstAt<0) firstAt=at;
    lastSequence=item.sequence;lastAt=at;lastCheck=monotonic();
    samples++;
    return item;
  };
  collect(); // Pre-load independently observed live guest PID + compiled bytes.
  return {
    check(){
      if(monotonic()-lastCheck >= 30_000) collect();
      else assert(Date.now()-lastAt<45_000,"Runtime certificate expired");
    },
    finish(startedAt,finishedAt){
      collect(); // Post-load certificate must be fresh and new.
      assertRuntimePhaseCoverage(firstAt,lastAt,startedAt,finishedAt,samples);
      return {samples,finalSequence:lastSequence};
    },
  };
}
