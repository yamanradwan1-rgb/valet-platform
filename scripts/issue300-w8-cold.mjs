// Cold is independent owned-guest reboot + fresh OS boot ID, not warm PG restart.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { readTarget, assertOwnedUri } from "./issue300-w8-target.mjs";

const sleep = (ms) => new Promise((ok)=>setTimeout(ok,ms));
const p95 = (items) => [...items].sort((a,b)=>a-b)[Math.ceil(items.length*.95)-1];
const budgets = {search:3000,timeline:1500,detail:800};
const bootPattern = /^[a-f0-9-]{36}$/;
const vbox = "C:\\Program Files\\Oracle\\VirtualBox\\VBoxManage.exe";

export function verifyColdBoot(previous, next, vm, startEpoch, containerId) {
  assert.match(next.bootId ?? "",bootPattern);
  assert.equal(next.vmUuid,vm);
  assert.equal(next.apiReady,true,
    "Guest must attest isolated API readiness before first cold read");
  assert.match(next.postgresStartedAt ?? "", /^\d{4}-\d\d-\d\dT/);
  if (containerId) assert.equal(next.pgContainerId,containerId,
    "Guest boot identity must attest the SAME PostgreSQL Docker container");
  assert(Number.isFinite(Date.parse(next.recordedAt)));
  assert(Date.parse(next.recordedAt) >= startEpoch);
  assert.notEqual(next.bootId,previous,
    "OS boot identity unchanged: PG-only or warm reset is not cold");
}

async function main() {
  const m = readTarget();
  const rawApi = process.env.ISSUE300_W8_API_URL;
  const api = assertOwnedUri(rawApi,m,"api");
  const origin = process.env.ISSUE300_W8_ORIGIN;
  assertOwnedUri(origin,m,"dashboard");
  assert.equal(process.env.ISSUE300_W8_COLD_ACK,"OWNED_GUEST_ONLY");
  assert.equal(m.resource.dedicatedVm,true);
  const vmInfo=execFileSync(vbox,["showvminfo",m.resource.vmUuid,
    "--machinereadable"],{encoding:"utf8",windowsHide:true,timeout:15000});
  assert(vmInfo.includes(`name="${m.resource.vmName}"`));
  assert(vmInfo.includes("VMState=\"running\""));
  assert(vmInfo.toLowerCase().includes(
    m.resource.dataPath.toLowerCase().split("data\\")[0]));
  const evidencePath = realpathSync(process.env.ISSUE300_W8_GUEST_BOOT_EVIDENCE);
  assert(evidencePath.toLowerCase().startsWith(m.resource.dataPath.toLowerCase()));
  const paths = JSON.parse(readFileSync(process.env.ISSUE300_W7_LOAD_PATHS,"utf8"));
  assert.equal(paths.candidateSha,m.candidateSha);
  assert.equal(paths.leaseId,m.leaseId);
  const token = process.env.ISSUE300_W7_STAFF_BEARER;
  assert.match(token ?? "",/^vsa1\.[A-Za-z0-9_-]{43}$/);
  const before = JSON.parse(readFileSync(evidencePath,"utf8"));
  assert.equal(before.vmUuid,m.resource.vmUuid);
  let previous = before.bootId;
  const trials = {search:[],timeline:[],detail:[]};
  for (const endpoint of Object.keys(budgets)) {
    const path = paths.endpoints[endpoint];
    assert.match(path,/^\/v1\/staff\/management\//);
    for (let i=0;i<20;i++) {
      const startEpoch = Date.now();
      // ONLY this exact VM. Never reboot host, Docker Desktop or shared W7.
      execFileSync(vbox,["controlvm",m.resource.vmUuid,"reset"],
        {windowsHide:true,timeout:30_000,stdio:"pipe"});
      let boot;
      for (let j=0;j<120;j++) {
        await sleep(1500);
        try {
          const stat = statSync(evidencePath);
          if (stat.mtimeMs <= startEpoch) continue;
          boot=JSON.parse(readFileSync(evidencePath,"utf8"));
          verifyColdBoot(previous,boot,m.resource.vmUuid,startEpoch,
            m.resource.containerId);
          break;
        } catch { /* Await isolated guest boot evidence; never fake cold. */ }
      }
      assert(boot,"Owned guest failed independent cold boot evidence");
      previous = boot.bootId;
      // Precisely ONE request after each guest reset. No warm-up/retry hiding.
      const started=performance.now();
      const response=await fetch(new URL(path,api), {
        headers:{Authorization:`Bearer ${token}`,Origin:origin},
        signal:AbortSignal.timeout(15_000),
      });
      const elapsedMs=performance.now()-started;
      assert.equal(response?.status,200,"No successful first cold HTTP");
      assert.equal(response.headers.get("cache-control")?.includes("no-store"),true);
      const body = await response.json();
      assert(body && typeof body === "object");
      trials[endpoint].push({trial:i+1,guestBootId:boot.bootId,
        guestBootEvidenceAt:boot.recordedAt,httpElapsedMs:elapsedMs,
        cacheResetVerified:true,method:"OWNED_VBOX_GUEST_OS_RESET"});
    }
  }
  for (const [name,rows] of Object.entries(trials)) {
    assert.equal(rows.length,20);
    assert.equal(new Set(rows.map((r)=>r.guestBootId)).size,20);
    assert(p95(rows.map((r)=>r.httpElapsedMs))<=budgets[name]);
  }
  const output={candidateSha:m.candidateSha,leaseId:m.leaseId,
    database:m.resource.database,containerId:m.resource.containerId,
    apiBundleSha256:m.resource.apiBundleSha256,targetTier:m.targetTier,
    methodology:"OWNED_GUEST_INDEPENDENT_OS_BOOT_ID",globalSharedCacheFlush:false,
    trials};
  assert(process.env.ISSUE300_W7_COLD_TRIALS);
  writeFileSync(process.env.ISSUE300_W7_COLD_TRIALS,
    JSON.stringify(output,null,2),{flag:"wx",mode:0o600});
  console.log(JSON.stringify({verdict:"20_TRUE_COLD_PER_ENDPOINT",
    sampleCounts:Object.fromEntries(Object.entries(trials).map(([k,v])=>[k,v.length]))}));
}

if (process.argv[1]?.endsWith("issue300-w8-cold.mjs"))
  main().catch((e)=>{console.error("W8 cold blocked:",e.message);process.exitCode=1;});
