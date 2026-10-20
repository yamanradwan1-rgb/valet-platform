import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { currentGapReconciliation } from "./issue300-w19-reconcile.mjs";

const file=new URL("../docs/validation/issue300/closure/R2_ACCEPTANCE_TRACKER.md",
  import.meta.url);
const source=readFileSync(file,"utf8");
const sha="0dc7d55e7b34cc598dddbce00a64babc0ff42e14";

test("full current-SHA framework accounts for every 79 historical rows",()=>{
  const report=currentGapReconciliation(source,sha);
  assert.deepEqual(report.counts,{mandatory:79,fullPass:0,gap:79});
  assert.equal(new Set(report.rows.map((r)=>r.id)).size,79);
  assert.equal(report.rows.find((r)=>r.id==="U05-R09").lane,
    "W8_SIGNED_REAL_LOAD");
  assert.equal(report.rows.find((r)=>r.id==="T62").status,"GAP");
  assert.equal(report.rows.find((r)=>r.id==="T70").status,"GAP");
});

test("historical PASS or partial annotations never auto-promote final result",()=>{
  const modified=source.replace("| T62 |","| T62 | HISTORICAL PASS |");
  assert.equal(currentGapReconciliation(modified,sha).counts.fullPass,0);
  assert.throws(()=>currentGapReconciliation(source.replace("| T62 |",
    "| T99 |"),sha),/79 distinct/);
  assert.throws(()=>currentGapReconciliation(source+"\n| T62 | duplicate |",sha),
    /Duplicate/);
  assert.throws(()=>currentGapReconciliation(source,"uncommitted"));
});
