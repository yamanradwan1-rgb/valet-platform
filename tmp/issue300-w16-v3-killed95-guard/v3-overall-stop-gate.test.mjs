import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { finalizeV3AfterVerifiedStop } from "./v3-overall-stop-gate.mjs";

const ID = "owned-w6-docker-id";
const snapshot = (running, overrides = {}) => ({
  Id: ID, owned: true,
  State: { Running: running, Status: running ? "running" : "exited",
    Pid: running ? 4101 : 0 },
  ...overrides,
});

function harness({
  stopped = true, stopThrows = false, sourcePass = true,
  after = null, readFails = false, wrongOwner = false, journalFails = false,
} = {}) {
  const events = [];
  let reads = 0;
  let stoppedNow = false;
  const inspect = async () => {
    events.push("INSPECT");
    const index = reads++;
    if (readFails && index > 0) throw Error("INSPECT_FAILED");
    if (index === 0) return snapshot(true);
    if (typeof after === "function") return after(index);
    if (after) return after;
    return snapshot(!(stoppedNow && stopped));
  };
  const verifyOwned = c => {
    events.push("VERIFY_OWNER");
    assert(c?.owned && !wrongOwner, "WRONG_OWNER");
  };
  const stop = async () => {
    events.push("STOP");
    if (stopThrows) throw Error("STOP_UNCONFIRMED");
    stoppedNow = true;
  };
  const recordHandoff = async receipt => {
    events.push("HANDOFF:" + receipt.postStatus);
    if (journalFails) throw Error("HANDOFF_JOURNAL_FAILED");
  };
  const mayPublishOverall = () => sourcePass;
  const recordOverall = async () => events.push("OVERALL_PASS");
  return { events, args: { inspect, verifyOwned, stop, expectedId: ID,
    recordHandoff, mayPublishOverall, recordOverall } };
}

test("positive: overall PASS ONLY AFTER owned Docker STOP, EXITED inspect, and journal", async () => {
  const h = harness();
  const out = await finalizeV3AfterVerifiedStop(h.args);
  assert.equal(out.published, true);
  assert.equal(out.receipt.verified, true);
  assert.equal(h.events.filter(x => x === "INSPECT").length, 3);
  const stopped = h.events.indexOf("STOP");
  const handoff = h.events.indexOf("HANDOFF:exited");
  const overall = h.events.indexOf("OVERALL_PASS");
  assert(stopped >= 0 && handoff > stopped && overall > handoff);
});

test("negative P1: Docker STOP fails, no earlier OR later OVERALL PASS", async () => {
  const h = harness({ stopThrows: true });
  await assert.rejects(finalizeV3AfterVerifiedStop(h.args), /STOP_UNCONFIRMED/);
  assert(!h.events.includes("OVERALL_PASS"));
  assert(!h.events.some(x => x.startsWith("HANDOFF:")));
});

test("negative P1: STOP returned success but Docker remains RUNNING", async () => {
  const h = harness({ stopped: false });
  await assert.rejects(finalizeV3AfterVerifiedStop(h.args),
    /V3_STOP_NOT_VERIFIED_EXITED/);
  assert(!h.events.includes("OVERALL_PASS"));
  assert(!h.events.some(x => x.startsWith("HANDOFF:")));
});

test("negative P1: inspect unavailable after STOP must never publish PASS", async () => {
  const h = harness({ readFails: true });
  await assert.rejects(finalizeV3AfterVerifiedStop(h.args), /INSPECT_FAILED/);
  assert(!h.events.includes("OVERALL_PASS"));
});

test("negative P1: misleading Docker state (dead, PID nonzero, wrong ID) refuses", async () => {
  for (const post of [
    snapshot(false, { State: { Running: false, Status: "dead", Pid: 0 } }),
    snapshot(false, { State: { Running: false, Status: "exited", Pid: 41 } }),
    snapshot(false, { Id: "different-id" }),
  ]) {
    const h = harness({ after: post });
    await assert.rejects(finalizeV3AfterVerifiedStop(h.args),
      /V3_STOP_NOT_VERIFIED_EXITED|V3_STOP_WRONG_CONTAINER_ID/);
    assert(!h.events.includes("OVERALL_PASS"));
  }
});

test("negative P1: container ownership lost even if STOP reported success", async () => {
  const h = harness({ wrongOwner: true });
  await assert.rejects(finalizeV3AfterVerifiedStop(h.args), /WRONG_OWNER/);
  assert(!h.events.includes("OVERALL_PASS"));
});

test("negative P1: post-handoff restart invalidates previously EXITED snapshot", async () => {
  const h = harness({ after: reads => reads < 2 ?
    snapshot(false) : snapshot(true) });
  await assert.rejects(finalizeV3AfterVerifiedStop(h.args),
    /V3_STOP_NOT_VERIFIED_EXITED/);
  assert(h.events.includes("HANDOFF:exited"));
  assert(!h.events.includes("OVERALL_PASS"));
});

test("negative P1: handoff journal failure cannot precede overall PASS", async () => {
  const h = harness({ journalFails: true });
  await assert.rejects(finalizeV3AfterVerifiedStop(h.args),
    /HANDOFF_JOURNAL_FAILED/);
  assert(!h.events.includes("OVERALL_PASS"));
});

test("negative P1: missing phase gates still require STOP but no overall PASS", async () => {
  const h = harness({ sourcePass: false });
  const result = await finalizeV3AfterVerifiedStop(h.args);
  assert.equal(result.published, false);
  assert(h.events.includes("STOP"));
  assert(h.events.includes("HANDOFF:exited"));
  assert(!h.events.includes("OVERALL_PASS"));
});

test("source contract: acceptance publishes overall only via post-stop gate", () => {
  const source = readFileSync(new URL("./v3-acceptance.mjs", import.meta.url), "utf8");
  const gate = source.indexOf("await finalizeV3AfterVerifiedStop({");
  const receipt = source.indexOf("recordHandoff:receipt=>output(");
  const overall = source.indexOf('recordOverall:receipt=>output("v3_overall","PASS"');
  assert(gate >= 0 && receipt > gate && overall > receipt);
  assert.equal(source.match(/output\("v3_overall","PASS"/g)?.length, 1);
  assert.match(source, /verifyOwned:c=>assertOwned\(c,true\)/);
});
