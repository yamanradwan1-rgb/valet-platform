// Independent Owner-pinned signer seals all mutable writer/reader proof bytes.
import assert from "node:assert/strict";
import { verifyDetachedBytes } from "./issue300-w8-http-evidence.mjs";
import { sha256OwnedFile } from "./issue300-w8-owner-root.mjs";

const artifactEnv = {
  baseline:"ISSUE300_W7_WRITER_BASELINE",
  live:"ISSUE300_W7_WRITER_LIVE",
  readers:"ISSUE300_W7_RESULTS_PATH",
  cold:"ISSUE300_W7_COLD_TRIALS",
  plans:"ISSUE300_W7_EXPLAIN_PLANS",
};

export function verifyPhaseSeal(m, readerReport, baselineReport,
  writerReport, env=process.env){
  assert.equal(baselineReport.mode,"baseline");
  assert(["normal","stress"].includes(readerReport.mode));
  assert.equal(writerReport.mode,readerReport.mode);
  assert(baselineReport.artifactId && writerReport.artifactId);
  assert.notEqual(baselineReport.artifactId,writerReport.artifactId);
  const baselineEnd=Date.parse(baselineReport.finishedAt);
  const liveStart=Date.parse(writerReport.startedAt);
  const readStart=Date.parse(readerReport.startedAt);
  const readEnd=Date.parse(readerReport.finishedAt);
  const liveEnd=Date.parse(writerReport.finishedAt);
  assert([baselineEnd,liveStart,readStart,readEnd,liveEnd]
    .every(Number.isFinite) && baselineEnd<liveStart &&
    liveStart<=readStart && readStart<readEnd && readEnd<=liveEnd,
    "Signed baseline/live/reader phases must be chronological and disjoint");
  const seal=verifyDetachedBytes(m,{
    key:env.ISSUE300_W8_PHASE_SEAL_KEY,
    payload:env.ISSUE300_W8_PHASE_SEAL_JSON,
    signature:env.ISSUE300_W8_PHASE_SEAL_SIG,
  },m.phaseSealIssuerKeySha256,env,
  "ISSUE300_W8_TRUSTED_PHASE_SEAL_KEY_SHA256");
  assert.equal(seal.provenance,"INDEPENDENT_OWNER_SIGNED_W8_PHASE_V1");
  assert.equal(seal.candidateSha,m.candidateSha);
  assert.equal(seal.leaseId,m.leaseId);
  assert.equal(seal.targetTier,m.targetTier);
  assert.equal(seal.sourceFixtureHash,m.sourceFixtureHash);
  assert.equal(seal.containerId,m.resource.containerId);
  assert.equal(seal.apiBundleSha256,m.resource.apiBundleSha256);
  assert.equal(seal.stage,readerReport.mode);
  assert.equal(seal.baselineMode,"baseline");
  assert.equal(seal.liveMode,readerReport.mode);
  assert.equal(seal.baselineArtifactId,baselineReport.artifactId);
  assert.equal(seal.liveArtifactId,writerReport.artifactId);
  assert.equal(seal.baselineStartedAt,baselineReport.startedAt);
  assert.equal(seal.baselineFinishedAt,baselineReport.finishedAt);
  assert.equal(seal.readerStartedAt,readerReport.startedAt);
  assert.equal(seal.readerFinishedAt,readerReport.finishedAt);
  assert.equal(seal.writerStartedAt,writerReport.startedAt);
  assert.equal(seal.writerFinishedAt,writerReport.finishedAt);
  const signedAt=Date.parse(seal.signedAt);
  assert(Number.isFinite(signedAt) &&
    signedAt>=readEnd && signedAt>=liveEnd &&
    signedAt<=Date.now(),"Phase seal predates completed load or future-dated");
  assert.deepEqual(Object.keys(seal.artifactSha256 ?? {}).sort(),
    Object.keys(artifactEnv).sort());
  assert.notEqual(seal.artifactSha256.baseline,seal.artifactSha256.live,
    "Replayed identical raw baseline/live evidence hash");
  assert.notEqual(env.ISSUE300_W7_WRITER_BASELINE,
    env.ISSUE300_W7_WRITER_LIVE,
    "Same raw evidence file cannot represent baseline and live phase");
  for(const [kind,variable] of Object.entries(artifactEnv)){
    assert.match(seal.artifactSha256[kind]??"",/^[a-f0-9]{64}$/);
    assert.equal(sha256OwnedFile(env[variable],m.resource.dataPath),
      seal.artifactSha256[kind],
      `Unsigned/mutated ${kind} W8 acceptance evidence`);
  }
  return {signer:m.phaseSealIssuerKeySha256,
    hashes:seal.artifactSha256,signedAt:seal.signedAt};
}
