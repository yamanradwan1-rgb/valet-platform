// Bridges exact synthetic-count artifact to the existing W7 reader harness.
import assert from "node:assert/strict";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { readTarget } from "./issue300-w8-target.mjs";
import { verifiedSourceOracle, verifyPinnedRoutes } from
  "./issue300-w8-http-evidence.mjs";

function withinOwned(path, m) {
  assert(path);
  const real=realpathSync(path);
  assert(real.toLowerCase().startsWith(m.resource.dataPath.toLowerCase()));
  return real;
}
export function makeLoadPaths(m, fixture, signed) {
  assert.equal(fixture.candidateSha,m.candidateSha);
  assert.equal(fixture.leaseId,m.leaseId);
  assert.equal(fixture.database,m.resource.database);
  assert.equal(fixture.targetTier,m.targetTier);
  assert.equal(fixture.provenance,"SYNTHETIC_SQL_ONLY");
  assert.equal(fixture.sourceFixtureHash,m.sourceFixtureHash);
  const families=["AUDIT","KEY_CUSTODY","DISPATCH","INCIDENT"];
  assert.equal(new Set(families).size,4);
  for(const name of families)
    assert.equal(fixture.sourceCounts?.[name],m.targetTier/4);
  assert.equal(fixture.scopedPersistedSourceRecords,m.targetTier);
  const endpoints=verifyPinnedRoutes(m.endpoints,m,signed);
  return {candidateSha:m.candidateSha,leaseId:m.leaseId,
    database:m.resource.database,databaseHost:m.resource.dbHost,
    databasePort:m.resource.dbPort,containerId:m.resource.containerId,
    apiBundleSha256:m.resource.apiBundleSha256,targetTier:m.targetTier,
    sourceFixtureHash:m.sourceFixtureHash,
    sourceCounts:fixture.sourceCounts,
    scopedPersistedSourceRecords:fixture.scopedPersistedSourceRecords,
    endpoints,fixtureProvenance:fixture.provenance};
}

if(process.argv[1]?.endsWith("issue300-w8-paths.mjs")){
  try {
    const m=readTarget();
    const signed=verifiedSourceOracle(m);
    const artifact=withinOwned(process.env.ISSUE300_W8_FIXTURE_OUTPUT,m);
    const fixture=JSON.parse(readFileSync(artifact,"utf8"));
    const paths=makeLoadPaths(m,fixture,signed);
    assert(process.env.ISSUE300_W7_LOAD_PATHS);
    const dest=process.env.ISSUE300_W7_LOAD_PATHS;
    assert(dest.toLowerCase().startsWith(m.resource.dataPath.toLowerCase()));
    writeFileSync(dest,JSON.stringify(paths,null,2),{flag:"wx",mode:0o600});
    console.log(JSON.stringify({verdict:"SYNTHETIC_COUNTS_MANIFEST_ONLY",
      targetTier:paths.targetTier,recordCount:paths.scopedPersistedSourceRecords}));
  }catch(e){console.error("W8 paths blocked:",e.message);process.exitCode=1;}
}
