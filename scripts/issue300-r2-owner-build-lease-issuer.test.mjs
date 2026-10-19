import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync,
  symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertExactRoot, encodeLease, requireIssueAuthorization, signLeaseBytes,
} from "./issue300-r2-owner-build-lease-issuer.mjs";
import { assertOwnerBuildLease,
  requireSignedBuildLease } from "./issue300-r2-owner-build-lease.mjs";
import { verifyBuildOwnerSignature } from "./issue300-r2-owner-build-signature.mjs";

// Genuine Owner private key is intentionally never imported/read. Fixture
// signatures are valid ONLY with explicit disposable verifier injection.
const ephemeral = generateKeyPairSync("ed25519");
const foreign = generateKeyPairSync("ed25519");
const sha = "a".repeat(40);
const leaseId = "issue300-r2-w17-" + "b".repeat(40);
const issued = Date.parse("2026-10-20T00:00:00.000Z");
const receipt = {
  candidateSha: sha, leaseId,
  startedAt: new Date(issued + 1000).toISOString(),
  finishedAt: new Date(issued + 3000).toISOString(),
};
const verifier = (bytes, signature) =>
  verifyBuildOwnerSignature(bytes, signature, ephemeral.publicKey);
const bytes = () => encodeLease({ candidateSha: sha, leaseId, now: issued });
const signature = value => signLeaseBytes(
  value, ephemeral.privateKey, ephemeral.publicKey);

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "issue300-w6-issuer-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const folder = join(root, "tmp", "issue300-r2-v2-prime-owned");
  mkdirSync(folder, { recursive: true });
  const file = join(folder, `W17_BUILD_LEASE_${sha}_${leaseId}.json`);
  const raw = bytes();
  writeFileSync(file, raw, { flag: "wx" });
  writeFileSync(file + ".sig", signature(raw), { flag: "wx" });
  return { root, folder, file, raw };
}

test("ephemeral Ed25519 lease matches exact real consumer schema (positive)",t=>{
  const {root,raw,file}=fixture(t);
  assert.equal(readFileSync(file).toString(), JSON.stringify(JSON.parse(raw)));
  verifier(raw, signature(raw));
  assert.equal(requireSignedBuildLease(root, receipt, issued + 4000, verifier),true);
  assert.equal(assertOwnerBuildLease(JSON.parse(raw),receipt,issued+4000),true);
  assert.throws(()=>verifyBuildOwnerSignature(raw,signature(raw)),
    /UNTRUSTED/);
});

test("random leaseId format, exact clean SHA and explicit Owner opt-in",()=>{
  const legitimate={NODE_ENV:"test",
    ISSUE300_W17_OWNER_LEASE_ISSUE_ENABLE:"1",
    ISSUE300_R2_CANDIDATE_SHA:sha};
  requireIssueAuthorization(legitimate,sha);
  for(const bad of [
    {NODE_ENV:"production"},
    {NODE_ENV:"development"},
    {ISSUE300_W17_OWNER_LEASE_ISSUE_ENABLE:"0"},
    {ISSUE300_W17_OWNER_LEASE_ISSUE_ENABLE:undefined},
    {ISSUE300_R2_CANDIDATE_SHA:"c".repeat(40)},
  ])assert.throws(()=>requireIssueAuthorization({...legitimate,...bad},sha));
  for(const changed of [
    // encodeLease validates shape; cleanCandidate + requireIssueAuthorization
    // separately bind a well-formed foreign SHA to the signed checkout.
    {candidateSha:"c".repeat(39)},
    {leaseId:"issue300-r2-w17-untrusted"},
    {leaseId:"issue300-r2-w17-"+"z".repeat(40)},
    {ttlMs:900001}, {ttlMs:0}, {now:NaN},
  ])assert.throws(()=>encodeLease({
    candidateSha:sha,leaseId,now:issued,...changed}));
});

test("signed raw payload not envelope, tampering and wrong private key refuse",()=>{
  const raw=bytes();
  const sig=signature(raw);
  assert.match(sig,/^[A-Za-z0-9+/]{86}==$/);
  assert.throws(()=>verifier(raw,signLeaseBytes(
    raw,foreign.privateKey,foreign.publicKey)),/UNTRUSTED/);
  assert.throws(()=>verifier(Buffer.from(raw.toString()+" "),sig),/UNTRUSTED/);
  assert.throws(()=>signLeaseBytes(raw,ephemeral.privateKey,foreign.publicKey),
    /SELF_CHECK/);
  assert.throws(()=>verifier(raw,JSON.stringify({signature:sig})),
    /MALFORMED/);
});

test("consumer rejects missing/unsigned/tampered lease and swapped sidecar",t=>{
  const {root,file,raw}=fixture(t);
  writeFileSync(file,JSON.stringify({...JSON.parse(raw),leaseId:"issue300-r2-w17-"+
    "c".repeat(40)}));
  assert.throws(()=>requireSignedBuildLease(root,receipt,issued+4000,verifier));
  writeFileSync(file,raw);
  writeFileSync(file+".sig",signLeaseBytes(raw,foreign.privateKey,
    foreign.publicKey));
  assert.throws(()=>requireSignedBuildLease(root,receipt,issued+4000,verifier));
  rmSync(file+".sig");
  assert.throws(()=>requireSignedBuildLease(root,receipt,issued+4000,verifier));
});

test("consumer rejects replay, wrong receipt, overlong and future leases",t=>{
  const {root,file}=fixture(t);
  assert.throws(()=>requireSignedBuildLease(root,receipt,
    issued+601000,verifier),/EXPIRED_OR_MISMATCH/);
  assert.throws(()=>requireSignedBuildLease(root,
    {...receipt,candidateSha:"c".repeat(40)},issued+4000,verifier));
  assert.throws(()=>requireSignedBuildLease(root,
    {...receipt,leaseId:"issue300-r2-w17-"+"c".repeat(40)},
    issued+4000,verifier));
  for(const bad of [
    {issuedAt:new Date(issued+10000).toISOString()},
    {expiresAt:new Date(issued+900001).toISOString()},
    {purpose:"ARBITRARY_BUILD"},
    {version:2}, {unknown:"unexpected"},
  ]){
    const payload=Buffer.from(JSON.stringify({...JSON.parse(bytes()),...bad}));
    writeFileSync(file,payload);
    writeFileSync(file+".sig",signature(payload));
    assert.throws(()=>requireSignedBuildLease(root,receipt,issued+4000,verifier));
  }
});

test("issuer and consumer reject hardlinks, symlinked lease and folder aliases",t=>{
  const {root,folder,file}=fixture(t);
  const hardlink=join(folder,"linked-lease.json");
  linkSync(file,hardlink);
  assert.throws(()=>requireSignedBuildLease(root,receipt,issued+4000,verifier),
    /FILE_UNSAFE/);
  rmSync(hardlink);
  const alias=join(root,"worktree-alias");
  try{symlinkSync(root,alias,process.platform==="win32"?"junction":"dir");}
  catch(error){
    if(["EPERM","EACCES","ENOTSUP"].includes(error.code))return t.skip("No symlink support");
    throw error;
  }
  assert.throws(()=>assertExactRoot(alias),/ROOT_ALIAS_DENIED/);
});

test("issuer writes are create-only and cannot replace signed evidence",t=>{
  const {file}=fixture(t);
  assert.throws(()=>writeFileSync(file,bytes(),{flag:"wx"}),/EEXIST/);
  assert.throws(()=>writeFileSync(file+".sig",signature(bytes()),{flag:"wx"}),
    /EEXIST/);
});
