// Canonical baseline vs live writer cohort: same IDs, command mix and coverage.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export function rosterDigest(roster){
  const publicRoster=roster.map((c)=>({
    clientId:c.clientId,sessionId:c.sessionId,membershipId:c.membershipId,
    organizationId:c.organizationId,locationId:c.locationId,
    command:c.command,keySlots:c.keySlots??[],
  })).sort((a,b)=>a.clientId.localeCompare(b.clientId));
  return createHash("sha256").update(JSON.stringify(publicRoster)).digest("hex");
}

export function assertWriterCohort(roster,oracle,required){
  assert([2,8].includes(required));
  assert.equal(roster.length,required);
  const names=roster.map((r)=>r.clientId).sort();
  assert.equal(new Set(names).size,required);
  const counts={
    INCIDENT_REPORT:roster.filter((r)=>r.command==="INCIDENT_REPORT").length,
    KEY_SLOT_ASSIGN:roster.filter((r)=>r.command==="KEY_SLOT_ASSIGN").length,
  };
  assert.deepEqual(counts,{INCIDENT_REPORT:required/2,
    KEY_SLOT_ASSIGN:required/2},"Must exercise both canonical writers equally");
  const expected=oracle.writerCohorts?.[String(required)];
  assert(expected,"Independently signed writer cohort for this size required");
  const digest=rosterDigest(roster);
  assert.equal(digest,expected.rosterDigest);
  assert.deepEqual(names,expected.clientIds);
  assert.deepEqual(counts,expected.commandMix);
  return {rosterDigest:digest,clientIds:names,commandMix:counts};
}

export function verifyWriterCoverage(report,oracle,clients){
  assert([2,8].includes(clients));
  assert(["baseline","normal","stress"].includes(report.mode),
    "Writer proof has no valid phase identity");
  assert(report.mode!=="normal" || clients===2);
  assert(report.mode!=="stress" || clients===8);
  assert.match(report.artifactId??"",
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
    "Each writer run needs a distinct generated evidence artifact ID");
  assert(report.elapsedMs>=600_000);
  const expected=oracle.writerCohorts?.[String(clients)];
  assert(expected);
  assert.equal(report.writerClients,clients);
  assert.equal(report.rosterDigest,expected.rosterDigest);
  assert.deepEqual([...report.writerClientIds].sort(),expected.clientIds);
  assert.equal(report.writerKind,"ACTUAL_OPERATIONAL_HTTP_OR_DOMAIN_COMMAND");
  assert.equal(report.failedCommands,0);
  assert.equal(report.deadlocks,0);
  assert.equal(report.lockTimeouts,0);
  const started=Date.parse(report.startedAt);
  const finished=Date.parse(report.finishedAt);
  assert(Number.isFinite(started) && Number.isFinite(finished));
  assert(finished-started>=600_000);
  assert(Math.abs((finished-started)-report.elapsedMs)<=5_000,
    "Wall clock phase duration disagrees with monotonic elapsed time");
  const byCommand={INCIDENT_REPORT:[],KEY_SLOT_ASSIGN:[]};
  const perClient=Object.fromEntries(expected.clientIds.map((id)=>[id,[]]));
  const lastClientAt=Object.fromEntries(expected.clientIds.map((id)=>[id,started-1]));
  for(const command of report.raw??[]){
    assert(command.clientId in perClient);
    assert(command.command in byCommand);
    assert(Number.isFinite(command.elapsedMs) && command.elapsedMs>=0);
    assert(Array.isArray(command.sourceIds) && command.sourceIds.length===2);
    assert(command.sourceIds.every((id)=>/^[a-f0-9-]{36}$/i.test(id)));
    if(command.command==="INCIDENT_REPORT")
      assert.equal(command.idempotencyVerified,true);
    const at=Date.parse(command.at);
    assert(Number.isFinite(at) && at>=started && at<=finished);
    assert(at>lastClientAt[command.clientId],
      "Each real writer client's command timestamps must be monotonic");
    lastClientAt[command.clientId]=at;
    perClient[command.clientId].push({at,command:command.command});
    byCommand[command.command].push(command.elapsedMs);
  }
  assert.equal(report.raw.length,report.successfulCommands);
  const latency=report.raw.map((r)=>r.elapsedMs);
  const measuredP95=percentile95(latency);
  assert(Number.isFinite(report.p95Ms) && report.p95Ms===measuredP95,
    "Reported writer p95 must match actual command timings");
  for(const [id,events] of Object.entries(perClient)){
    assert(events.length>=20,`Nonproductive writer client ${id}`);
    events.sort((a,b)=>a.at-b.at);
    assert(events[0].at-started<=30_000);
    assert(finished-events.at(-1).at<=30_000);
    for(let i=1;i<events.length;i++)
      assert(events[i].at-events[i-1].at<=30_000,
        `Writer client ${id} idle for >30s`);
    assert(new Set(events.map((r)=>r.command)).size===1,
      "Each writer client must keep its exact pinned command role");
  }
  const ratio=byCommand.INCIDENT_REPORT.length /
    byCommand.KEY_SLOT_ASSIGN.length;
  assert(ratio>=.8 && ratio<=1.25,
    "Achieved canonical operation mix skewed toward cheaper commands");
  assert.deepEqual(report.commandCounts,{
    INCIDENT_REPORT:byCommand.INCIDENT_REPORT.length,
    KEY_SLOT_ASSIGN:byCommand.KEY_SLOT_ASSIGN.length});
  return byCommand;
}

export function assertComparableWriters(baseline,live,oracle,required){
  assert.equal(baseline.mode,"baseline",
    "Writer-only baseline MUST originate in baseline mode");
  assert(["normal","stress"].includes(live.mode),
    "Concurrent writer result MUST originate in normal/stress mode");
  assert.equal(live.mode,required===2?"normal":"stress",
    "Concurrent writer mode inconsistent with signed cohort size");
  assert.notEqual(baseline.artifactId,live.artifactId,
    "Replayed writer phase artifact ID");
  const earlier=verifyWriterCoverage(baseline,oracle,required);
  const later=verifyWriterCoverage(live,oracle,required);
  assert(Date.parse(baseline.finishedAt)<Date.parse(live.startedAt),
    "Writer baseline and live intervals must be disjoint and chronological");
  const sources=new Set();
  for(const report of [baseline,live])for(const command of report.raw){
    for(const sourceId of command.sourceIds){
      const key=sourceId.toLowerCase();
      assert(!sources.has(key),
        "Reused persisted writer source ID across baseline/live evidence");
      sources.add(key);
    }
  }
  for(const key of Object.keys(earlier)){
    assert(later[key].length >= earlier[key].length*.8,
      `Writer throughput collapsed for ${key}`);
    const before=percentile95(earlier[key]);
    const after=percentile95(later[key]);
    assert(after<=before*1.2 && after-before<=100,
      `Live ${key} writer p95 exceeds absolute/relative budget`);
  }
  assert(live.p95Ms<=baseline.p95Ms*1.2 &&
    live.p95Ms-baseline.p95Ms<=100,
    "Live writer p95 exceeds both absolute and relative budget");
  return true;
}

function percentile95(items){
  assert(items.length>0);
  return [...items].sort((a,b)=>a-b)[Math.ceil(items.length*.95)-1];
}
