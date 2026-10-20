// Creates a current-SHA GAP register; never carries a historical PASS forward.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const source=join(root,"docs/validation/issue300/closure/R2_ACCEPTANCE_TRACKER.md");
const required=[...Array.from({length:9},(_,i)=>`U05-R${String(i+1).padStart(2,"0")}`),
  ...Array.from({length:70},(_,i)=>`T${String(i+1).padStart(2,"0")}`)];
const perf=new Set(["U05-R09","T62","T63","T64"]);

export function currentGapReconciliation(markdown,candidateSha){
  assert.match(candidateSha,/^[a-f0-9]{40}$/);
  const original=new Map();
  for(const line of markdown.split(/\r?\n/)){
    const match=line.match(/^\|\s*(U05-R0[1-9]|T(?:0[1-9]|[1-6]\d|70))\s*\|/);
    if(!match) continue;
    assert(!original.has(match[1]),`Duplicate acceptance row ${match[1]}`);
    original.set(match[1],line);
  }
  assert.deepEqual([...original.keys()].sort(),[...required].sort(),
    "All 79 distinct mandatory acceptance rows must be accounted for");
  const sourceLedgerSha256=createHash("sha256").update(markdown).digest("hex");
  return {candidateSha,sourceLedgerSha256,
    verdict:"CURRENT_SHA_ACCEPTANCE_GAP",
    counts:{mandatory:79,fullPass:0,gap:79},
    rows:required.map((id)=>({id,currentSha:candidateSha,
      status:"GAP",validation:"NOT_EXECUTED_OR_NOT_INDEPENDENTLY_ATTESTED",
      lane:perf.has(id)?"W8_SIGNED_REAL_LOAD":"OWNER_G3_PER_ROW",
      historicalSourceLineSha256:createHash("sha256")
        .update(original.get(id)).digest("hex")}))};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const sha=process.argv[2];
  // No argument/default inference from an old report or mutable environment.
  const result=currentGapReconciliation(readFileSync(source,"utf8"),sha);
  console.log(JSON.stringify(result,null,2));
}
