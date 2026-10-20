// Coordinates two independent processes; does NOT replace real domain writers.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readTarget, assertOwnedUri, assertLeaseActive } from "./issue300-w8-target.mjs";
import { verifiedSourceOracle } from "./issue300-w8-http-evidence.mjs";
import { verifyWriterCoverage } from "./issue300-w8-writer-proof.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const delay=(ms)=>new Promise((ok)=>setTimeout(ok,ms));

async function launch(file,extra) {
  const args=[join(root,"scripts",file)];
  const subprocess=spawn(process.execPath,args,{
    cwd:root,env:{...process.env,...extra},windowsHide:true,stdio:["ignore","pipe","pipe"],
  });
  let out="",err="";
  for(const stream of [subprocess.stdout,subprocess.stderr]) {
    stream.on("data",(chunk)=>{
      if(stream===subprocess.stdout) out=(out+chunk.toString()).slice(-4000);
      else err=(err+chunk.toString()).slice(-4000);
    });
  }
  return {
    process:subprocess,
    finished:new Promise((resolve,reject)=>{
      subprocess.once("error",reject);
      subprocess.once("exit",(code)=>resolve({code,out,err}));
    }),
  };
}

function checkArtifact(file,m,mode) {
  assert(existsSync(file),`Required ${mode} artifact missing`);
  const item=JSON.parse(readFileSync(file,"utf8"));
  for(const key of ["candidateSha","leaseId"])
    assert.equal(item[key],m[key]);
  assert.equal(item.database,m.resource.database);
  assert.equal(item.containerId,m.resource.containerId);
  assert.equal(item.apiBundleSha256,m.resource.apiBundleSha256);
  assert.equal(item.targetTier,m.targetTier);
  return item;
}

async function main() {
  const m=readTarget();
  const oracle=verifiedSourceOracle(m);
  const mode=process.env.ISSUE300_W8_STAGE;
  assert(["baseline","normal","stress"].includes(mode));
  assertOwnedUri(process.env.ISSUE300_W8_API_URL,m,"api");
  assertOwnedUri(process.env.ISSUE300_W8_RUNTIME_DB_URL,m,"db");
  assert.equal(process.env.ISSUE300_W8_SINGLE_HEAVY_LEASE,"GRANTED");
  assert.equal(process.env.ISSUE300_W8_CAPACITY_ATTESTED,"TRUE");
  assert.equal(m.targetTier,Number(process.env.ISSUE300_W8_TIER));
  const expectedWriters=mode==="stress"?8:
    mode==="normal"?2:Number(process.env.ISSUE300_W8_BASELINE_WRITERS);
  assert([2,8].includes(expectedWriters));
  assertLeaseActive(m,mode==="baseline"?610_000:700_000);
  if(mode!=="baseline") {
    const baseline=checkArtifact(process.env.ISSUE300_W7_WRITER_BASELINE,m,"baseline");
    assert.equal(baseline.writerClients,expectedWriters);
    verifyWriterCoverage(baseline,oracle,expectedWriters);
    checkArtifact(process.env.ISSUE300_W7_COLD_TRIALS,m,"cold");
    checkArtifact(process.env.ISSUE300_W7_EXPLAIN_PLANS,m,"plans");
  }
  const writerEnv={ISSUE300_W8_WRITER_MODE:mode,
    ISSUE300_W8_BASELINE_WRITERS:String(expectedWriters),
    ISSUE300_W8_WRITER_RESULT_PATH:mode==="baseline"?
      process.env.ISSUE300_W7_WRITER_BASELINE:
      process.env.ISSUE300_W7_WRITER_LIVE};
  assert(writerEnv.ISSUE300_W8_WRITER_RESULT_PATH);
  const writer=await launch("issue300-w8-writer-clients.mjs",writerEnv);
  if(mode==="baseline"){
    const outcome=await writer.finished;
    assert.equal(outcome.code,0,"Baseline real writer not qualified");
    verifyWriterCoverage(
      checkArtifact(writerEnv.ISSUE300_W8_WRITER_RESULT_PATH,m,"baseline"),
      oracle,expectedWriters);
    assertLeaseActive(m);
    console.log("W8 writer-only baseline completed; NO reader-phase claimed");
    return;
  }
  // Keep real writers active at least 30 seconds beyond the 600s reader load.
  await delay(1500);
  assert(writer.process.exitCode===null,"Real writer exited before readers");
  const reader=await launch("issue300-closure-load-proof.mjs",{
    ISSUE300_W7_LOAD_MODE:mode,
  });
  const [writerResult,readResult]=await Promise.all([
    writer.finished,reader.finished,
  ]);
  assert.equal(writerResult.code,0,"Real operational writers failed");
  assert.equal(readResult.code,0,"Search/Timeline/detail reader proof failed");
  checkArtifact(process.env.ISSUE300_W7_WRITER_LIVE,m,"real-writer");
  checkArtifact(process.env.ISSUE300_W7_RESULTS_PATH,m,"HTTP-readers");
  assertLeaseActive(m);
  console.log(JSON.stringify({verdict:"NORMAL_OR_STRESS_ATTESTED",
    mode,tier:m.targetTier,writers:expectedWriters,
    readers:mode==="normal"?5:25,durationMs:600000}));
}

if(process.argv[1]?.endsWith("issue300-w8-run.mjs"))
  main().catch((e)=>{console.error("W8 orchestration blocked:",e.message);
    process.exitCode=1;});
