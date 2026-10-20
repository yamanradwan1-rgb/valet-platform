// V3 source-only overall acceptance finalizer. No Docker, DB, or process APIs.
// The caller provides task-owned inspect/stop, Owner verifier and journal.
import assert from "node:assert/strict";

function assertExitedOwned(container, verifyOwned, expectedId) {
  verifyOwned(container); // must check task label, volume, anchor, port, owner
  assert(typeof expectedId === "string" && expectedId.length > 0 &&
    container?.Id === expectedId, "V3_STOP_WRONG_CONTAINER_ID");
  assert(container.State?.Running === false &&
    container.State?.Status === "exited" && container.State?.Pid === 0,
  "V3_STOP_NOT_VERIFIED_EXITED");
}

// A completed migration suite is NOT overall PASS while PostgreSQL's owned
// container is still running, or if its exit cannot be independently read.
export async function finalizeV3AfterVerifiedStop({
  inspect, verifyOwned, stop, expectedId, recordHandoff, mayPublishOverall,
  recordOverall,
}) {
  assert([inspect, verifyOwned, stop, recordHandoff,
    mayPublishOverall, recordOverall].every(fn => typeof fn === "function"),
  "V3_FINALIZER_MISSING_CALLBACK");
  const before = await inspect();
  verifyOwned(before);
  assert(before?.Id === expectedId, "V3_STOP_WRONG_PRE_CONTAINER_ID");
  assert(typeof before.State?.Running === "boolean",
    "V3_STOP_PRE_STATE_UNVERIFIED");
  if (before.State.Running) await stop();
  const after = await inspect(); // cannot trust docker stop return code alone
  assertExitedOwned(after, verifyOwned, expectedId);
  const receipt = Object.freeze({ verified: true, id: expectedId,
    postStatus: "exited", running: false, pid: 0,
    stoppedFromRunning: before.State.Running });

  // A handoff journal failure must also prevent any overall PASS.
  await recordHandoff(receipt);
  let published = false;
  if (mayPublishOverall()) {
    // Protect against a stale post-stop observation or a quick restart.
    assertExitedOwned(await inspect(), verifyOwned, expectedId);
    if (!mayPublishOverall()) {
      throw Error("V3_FINAL_GATES_REVOKED_AFTER_STOP");
    }
    await recordOverall(receipt);
    published = true;
  }
  return { receipt, published };
}
