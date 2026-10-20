// V3 orchestrator; all security checks remain in dedicated proof modules.
import * as runtime from "./v3-acceptance-runtime.mjs";
import { createMigrationProof } from "./v3-acceptance-migrations.mjs";
import { createSourceProof } from "./v3-acceptance-source-proofs.mjs";
import { createRaceProof } from "./v3-acceptance-races.mjs";
import { createKilled95Proof } from "./v3-acceptance-killed95.mjs";
import { createBootstrap } from "./v3-acceptance-bootstrap.mjs";
import { finalizeV3AfterVerifiedStop } from "./v3-overall-stop-gate.mjs";
const migrations = createMigrationProof(runtime);
const sources = createSourceProof(runtime);
const races = createRaceProof({...runtime,...migrations});
const killed = createKilled95Proof({...runtime,...migrations});
const bootstrap = createBootstrap(runtime);
const {state,assert,root,databaseRoot,names,anchorSha,readFileSync,join,
  createRequire,mkdirSync,evidenceDir,phaseGate,output,dbs,
  checkSourceBoundary,dockerName,port,volume,inspect,assertOwned,run} = runtime;
const {migrate,catalog} = migrations;
const {fixture,integrity,attributionFreeze,provisionAndAcl} = sources;
const {racePassed,racing,interruption} = races;
const {processKillWhileLocked} = killed;
const {launch,createDb} = bootstrap;
async function main(){
  assert(process.argv[2]==="--run","Explicit --run required");
  state.Client=createRequire(join(databaseRoot,"package.json"))("pg").Client;
  mkdirSync(evidenceDir,{recursive:true});
  await launch();
  phaseGate("initial_fixture_creation");
  await createDb(dbs.race);await createDb(dbs.interrupted);
  await createDb(dbs.killed);await createDb(dbs.fresh);
  phaseGate("fresh_zero_to96");
  const fresh=await migrate(dbs.fresh,96);
  output("fresh_zero_to96","PASS",{...fresh,catalog:await catalog(dbs.fresh,6,6),
    newDatabase:dbs.fresh,noHistoricalFixtures:true});
  phaseGate("upgrade_prefix93");
  output("upgrade_prefix93","PASS",{...await migrate(dbs.upgrade,93)});
  const ids=await fixture(dbs.upgrade);
  output("populated93","PASS",{committedHistoricalEntities:6,taskId:ids.task,
    incidentId:ids.incident,custodyId:ids.custody,dispatchId:ids.dispatch});
  for(const n of [94,95,96]){
    phaseGate("upgrade_"+n);
    const prefix=await migrate(dbs.upgrade,n);
    const c=await catalog(dbs.upgrade,n===94?5:6,n===94?0:n===95?4:6);
    output("upgrade_"+n,"PASS",{...prefix,catalog:c});
  }
  output("legacy_retention","PASS",await integrity(dbs.upgrade,ids));
  output("migration96_attribution_freeze","PASS",await attributionFreeze(dbs.upgrade,ids));
  phaseGate("canonical_runtime_acl");
  output("ordinary_role_acl","PASS",await provisionAndAcl(dbs.upgrade,ids));
  phaseGate("race_setup93");
  const rr=await migrate(dbs.race,93);
  output("race_prefix93","PASS",rr);
  phaseGate("concurrent_runners");
  await racing(dbs.race);
  phaseGate("interruption_setup93");
  const ir=await migrate(dbs.interrupted,93);
  output("interrupt_prefix93","PASS",ir);
  phaseGate("held_writer94");
  await interruption(dbs.interrupted);
  phaseGate("process_kill95");
  await processKillWhileLocked(dbs.killed);
}
if(process.argv[2]==="--check"){
  const actualHead=checkSourceBoundary();
  assert(names.length===96,"Missing migration source");
  for(const n of [94,95,96]){
    const statement=readFileSync(join(databaseRoot,"prisma/migrations",names[n-1],"migration.sql"),"utf8");
    assert(/^BEGIN;\s*$/m.test(statement)&&/^COMMIT;\s*$/m.test(statement) &&
      /SET LOCAL lock_timeout = '5s';/.test(statement),
      "Migration boundary lock timeout or transaction changed "+n);
  }
  const good=[{exitCode:0,startedAtMs:100,endedAtMs:400,timedOut:false,pressure:false},
    {exitCode:0,startedAtMs:200,endedAtMs:500,timedOut:false,pressure:false}];
  const witnessed={holderPid:101,waiterPid:102,actualAdvisoryWait:true};
  assert(racePassed(good,witnessed),"Positive race verdict oracle rejected valid overlap");
  assert(!racePassed([good[0],{...good[1],exitCode:1}],witnessed),
    "False PASS for second Prisma auth/lock loser");
  assert(!racePassed([good[0],{...good[1],exitCode:-9}],witnessed),
    "False PASS for second crashed Prisma process");
  assert(!racePassed(good,null),"False PASS with no live PG advisory lock witness");
  console.log(JSON.stringify({mode:"OFFLINE_ONLY",result:"PASS",anchoredSha:anchorSha,
    inspectedCurrentHead:actualHead,unchangedDatabaseTree:true,migrations:96,
    boundedTransactionMigrations:[94,95,96],raceNegativeOracleTests:3,
    name:dockerName,volume,port,
    mutatedDocker:false,requiresExplicitPrimeLease:true}));
}else{
  let readyForOverall=false,mandatoryGateCount=0;
  try{
    await main();
    const required=["preflight","new_v3_resource","fresh_zero_to96",
      "upgrade_prefix93","populated93",
      "upgrade_94","upgrade_95","upgrade_96","legacy_retention",
      "migration96_attribution_freeze","ordinary_role_acl","race_prefix93",
      "concurrent_prisma_runners","interrupt_prefix93","held_writer_lock94",
      "interruption_recovery","process_death_while_ddl_blocked",
      "interrupted95_catalog_reconciled"];
    const incomplete=required.filter(n=>!state.completed.has(n));
    assert(!state.hasGap&&incomplete.length===0,"Acceptance mandatory gates missing: "+incomplete.join(","));
    mandatoryGateCount=required.length;
    readyForOverall=true;
  }catch(e){
    // Guard against leaking Docker CLI -e POSTGRES_PASSWORD=..., DB URLs,
    // or private file content from raw child exception messages.
    let reason=String(e?.message??"Unknown V3 acceptance failure");
    for(const value of [state.secrets?.ownerPassword,state.secrets?.runtimePassword]){
      if(typeof value==="string"&&value.length)reason=reason.replaceAll(value,"[REDACTED]");
    }
    reason=reason.replace(/postgres(?:ql)?:\/\/[^\s]+/gi,"[REDACTED_PG_URL]");
    output("v3_failure","GAP",{message:reason.slice(0,170)});
    process.exitCode=1;
  }
  finally{
    // V3 overall PASS is gated on the SAME exact owned container being
    // independently inspected EXITED after stop. A Docker command exit
    // alone is NOT a shutdown witness. No PASS can precede this finalizer.
    if(state.ownership){
      try{
        await finalizeV3AfterVerifiedStop({
          inspect,verifyOwned:c=>assertOwned(c,true),
          expectedId:state.dockerId,
          stop:()=>run("docker",["stop","-t","1",dockerName]),
          recordHandoff:receipt=>output("v3_resource_handoff",
            state.unsafePressure?"STOPPED_ON_PRESSURE":"OWNED_PG_STOPPED",
            {id:receipt.id,port,volume,verifiedExited:true,
              postStatus:receipt.postStatus,protectedOtherResources:true}),
          mayPublishOverall:()=>readyForOverall&&!state.hasGap&&!state.unsafePressure&&
            !process.exitCode,
          recordOverall:receipt=>output("v3_overall","PASS",{
            allMandatoryGates:mandatoryGateCount,actualIntegrationHead:state.currentSha,
            resource:dockerName,postStopVerified:true,stoppedContainerId:receipt.id,
            note:"V3 owned PG independently verified exited before overall PASS",
          }),
        });
      }catch{
        output("v3_finalization_failure","GAP",{
          state:"STOP_OR_POST_EXIT_UNCONFIRMED",port,volume,
          overallPassWithheld:true,
        });
        process.exitCode=1;
      }
    }
  }
}
