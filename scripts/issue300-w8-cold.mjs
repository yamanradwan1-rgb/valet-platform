// Cold is independent owned-guest reboot + fresh OS boot ID, not warm PG restart.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, createPublicKey, verify } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { join, resolve, sep } from "node:path";
import { readTarget, assertOwnedUri } from "./issue300-w8-target.mjs";
import { verifiedSourceOracle, verifyPinnedRoutes, assertExpectedHttp,
  verifyDetachedBytes, u004ColdBudgets } from "./issue300-w8-http-evidence.mjs";
import { verifySignedColdTrial } from "./issue300-w8-cold-trial.mjs";

const sleep = (ms) => new Promise((ok)=>setTimeout(ok,ms));
const p95 = (items) => [...items].sort((a,b)=>a-b)[Math.ceil(items.length*.95)-1];
const budgets = u004ColdBudgets;
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

export function assertSignedGuestBoot(boot, m, startEpoch) {
  verifyColdBoot(null,boot,m.resource.vmUuid,startEpoch,m.resource.containerId);
  assert.equal(boot.provenance,"OWNED_GUEST_SIGNED_KERNEL_BOOT_ID");
  assert.equal(boot.candidateSha,m.candidateSha);
  assert.equal(boot.leaseId,m.leaseId);
  assert.equal(boot.targetTier,m.targetTier);
  assert.equal(boot.sourceFixtureHash,m.sourceFixtureHash);
  assert.equal(boot.apiBundleSha256,m.resource.apiBundleSha256);
  assert.equal(boot.apiPort,m.resource.apiPort);
  assert.equal(boot.postgresVersion,m.resource.postgresVersion);
  assert.equal(boot.osKernelBootVerified,true);
  assert.equal(boot.pgProcessStartedAfterBoot,true);
  assert(Number.isInteger(boot.apiPid) && boot.apiPid>0);
  assert(Number.isFinite(Date.parse(boot.apiProcessStartedAt)));
  assert(Date.parse(boot.apiProcessStartedAt)<=Date.parse(boot.recordedAt));
  return true;
}

export function verifyColdArtifact(cold, m, oracle, env=process.env) {
  assert.equal(cold.methodology,"OWNED_GUEST_INDEPENDENT_OS_BOOT_ID");
  assert.equal(cold.globalSharedCacheFlush,false);
  const keyPath=realpathSync(env.ISSUE300_W8_GUEST_BOOT_KEY);
  assert(keyPath.toLowerCase().replaceAll("\\","/").startsWith(
    m.resource.dataPath.toLowerCase().replaceAll("\\","/")));
  const publicKey=createPublicKey(readFileSync(keyPath));
  assert.equal(publicKey.asymmetricKeyType,"ed25519");
  const sha=createHash("sha256").update(publicKey.export({
    type:"spki",format:"der"})).digest("hex");
  assert.equal(sha,m.guestBootIssuerKeySha256);
  assert.equal(sha,env.ISSUE300_W8_TRUSTED_GUEST_BOOT_KEY_SHA256);
  const all=new Set();
  for(const endpoint of Object.keys(budgets)){
    const rows=cold.trials?.[endpoint];
    assert(Array.isArray(rows) && rows.length===20);
    for(const trial of rows){
      const bytes=Buffer.from(trial.signedBootPayloadBase64 ?? "","base64");
      const signature=Buffer.from(trial.signedBootSignatureBase64 ?? "","base64");
      assert(bytes.length>0 && signature.length===64);
      assert(verify(null,bytes,publicKey,signature),
        "Missing/forged signed independent guest boot");
      const boot=JSON.parse(bytes.toString("utf8"));
      assertSignedGuestBoot(boot,m,Date.parse(trial.resetIssuedAt));
      assert.equal(trial.guestBootId,boot.bootId);
      assert.equal(trial.guestBootEvidenceAt,boot.recordedAt);
      assert.equal(trial.cacheResetVerified,true);
      assert.equal(trial.responseValidated,true);
      assert(Number.isFinite(trial.httpElapsedMs) && trial.httpElapsedMs>=0);
      verifySignedColdTrial(trial,m,oracle,endpoint,boot,env);
      assert(!all.has(boot.bootId),"Duplicate boot across endpoints");
      all.add(boot.bootId);
    }
  }
  assert.equal(all.size,20*Object.keys(budgets).length);
  return true;
}

async function main() {
  const m = readTarget();
  const oracle=verifiedSourceOracle(m);
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
  verifyPinnedRoutes(paths.endpoints,m,oracle);
  assert.equal(paths.candidateSha,m.candidateSha);
  assert.equal(paths.leaseId,m.leaseId);
  const token = process.env.ISSUE300_W7_STAFF_BEARER;
  assert.match(token ?? "",/^vsa1\.[A-Za-z0-9_-]{43}$/);
  const receiptDir=realpathSync(process.env.ISSUE300_W8_COLD_RECEIPTS_DIR);
  assert(receiptDir.toLowerCase().startsWith(
    (resolve(m.resource.dataPath)+sep).toLowerCase()));
  const evidenceSignature=evidencePath+".sig";
  const before=verifyDetachedBytes(m,{
    key:process.env.ISSUE300_W8_GUEST_BOOT_KEY,
    payload:evidencePath,signature:evidenceSignature,
  },m.guestBootIssuerKeySha256,process.env,
  "ISSUE300_W8_TRUSTED_GUEST_BOOT_KEY_SHA256");
  assertSignedGuestBoot(before,m,0);
  let previous = before.bootId;
  // Keep the executed cold lanes identical to the signed four-lane budget.
  // A hard-coded three-key bag silently omitted busySlotSearch and failed
  // on its first actual cold response instead of measuring all 80 trials.
  const trials = Object.fromEntries(Object.keys(budgets).map((key) => [key, []]));
  const allBoots=new Set([previous]);
  for (const endpoint of Object.keys(budgets)) {
    const path = paths.endpoints[endpoint];
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
          boot=verifyDetachedBytes(m,{
            key:process.env.ISSUE300_W8_GUEST_BOOT_KEY,
            payload:evidencePath,signature:evidenceSignature,
          },m.guestBootIssuerKeySha256,process.env,
          "ISSUE300_W8_TRUSTED_GUEST_BOOT_KEY_SHA256");
          assertSignedGuestBoot(boot,m,startEpoch);
          verifyColdBoot(previous,boot,m.resource.vmUuid,startEpoch,
            m.resource.containerId);
          assert(!allBoots.has(boot.bootId),
            "Guest boot reused across endpoint trials");
          allBoots.add(boot.bootId);
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
      const localHttpElapsedMs=performance.now()-started;
      assert.equal(response?.status,200,"No successful first cold HTTP");
      assert.equal(response.headers.get("cache-control")?.includes("no-store"),true);
      const body = await response.json();
      assertExpectedHttp(endpoint,body,oracle);
      const receipt=join(receiptDir,`${endpoint}-${i+1}.json`);
      const receiptSig=receipt+".sig";
      for(let n=0;n<40 && (!existsSync(receipt) ||
        !existsSync(receiptSig));n++) await sleep(250);
      assert(existsSync(receipt) && existsSync(receiptSig),
        "Independent timing observer did not sign the entire cold trial");
      const payloadBytes=readFileSync(receipt);
      const observed=JSON.parse(payloadBytes.toString("utf8"));
      const trial={trial:i+1,guestBootId:boot.bootId,
        guestBootEvidenceAt:boot.recordedAt,
        httpElapsedMs:observed.httpElapsedMs,localHttpElapsedMs,
        responseSha256:createHash("sha256")
          .update(JSON.stringify(body)).digest("hex"),
        resetIssuedAt:new Date(startEpoch).toISOString(),
        signedBootPayloadBase64:readFileSync(evidencePath).toString("base64"),
        signedBootSignatureBase64:readFileSync(evidenceSignature).toString("base64"),
        signedTrialPayloadBase64:payloadBytes.toString("base64"),
        signedTrialSignatureBase64:readFileSync(receiptSig).toString("base64"),
        cacheResetVerified:true,responseValidated:true,
        method:"OWNED_VBOX_GUEST_OS_RESET"};
      verifySignedColdTrial(trial,m,oracle,endpoint,boot);
      trials[endpoint].push(trial);
    }
  }
  for (const [name,rows] of Object.entries(trials)) {
    assert.equal(rows.length,20);
    assert.equal(new Set(rows.map((r)=>r.guestBootId)).size,20);
    assert(p95(rows.map((r)=>r.httpElapsedMs))<=budgets[name]);
  }
  assert.equal(allBoots.size,1+20*Object.keys(budgets).length,
    "Exactly one distinct signed OS boot per cold trial");
  const output={candidateSha:m.candidateSha,leaseId:m.leaseId,
    database:m.resource.database,containerId:m.resource.containerId,
    apiBundleSha256:m.resource.apiBundleSha256,targetTier:m.targetTier,
    methodology:"OWNED_GUEST_INDEPENDENT_OS_BOOT_ID",globalSharedCacheFlush:false,
    trials};
  verifyColdArtifact(output,m,oracle);
  assert(process.env.ISSUE300_W7_COLD_TRIALS);
  writeFileSync(process.env.ISSUE300_W7_COLD_TRIALS,
    JSON.stringify(output,null,2),{flag:"wx",mode:0o600});
  console.log(JSON.stringify({verdict:"20_TRUE_COLD_PER_ENDPOINT",
    sampleCounts:Object.fromEntries(Object.entries(trials).map(([k,v])=>[k,v.length]))}));
}

if (process.argv[1]?.endsWith("issue300-w8-cold.mjs"))
  main().catch((e)=>{console.error("W8 cold blocked:",e.message);process.exitCode=1;});
