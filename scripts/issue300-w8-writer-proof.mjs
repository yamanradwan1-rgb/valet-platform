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
  const byCommand={INCIDENT_REPORT:[],KEY_SLOT_ASSIGN:[]};
  const perClient=Object.fromEntries(expected.clientIds.map((id)=>[id,[]]));
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
    perClient[command.clientId].push({at,command:command.command});
    byCommand[command.command].push(command.elapsedMs);
  }
  assert.equal(report.raw.length,report.successfulCommands);
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
  const earlier=verifyWriterCoverage(baseline,oracle,required);
  const later=verifyWriterCoverage(live,oracle,required);
  for(const key of Object.keys(earlier)){
    assert(later[key].length >= earlier[key].length*.8,
      `Writer throughput collapsed for ${key}`);
  }
  assert(live.p95Ms<=baseline.p95Ms*1.2 &&
    live.p95Ms-baseline.p95Ms<=100,
    "Live writer p95 exceeds both absolute and relative budget");
  return true;
}
