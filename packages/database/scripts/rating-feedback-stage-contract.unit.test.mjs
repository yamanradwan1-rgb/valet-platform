import assert from "node:assert/strict";
import { test } from "node:test";

import {
  feedbackRoles,
  feedbackRoutines,
  expectedFeedbackExecutors,
  resolveFeedbackStage,
} from "./rating-feedback-stage-contract.mjs";

const identity = {
  phase: "PROTECTED",
  installed: "P5",
  runtimeRole: "p0463_runtime",
  migrationRole: "p0463_migrator",
  disposable: true,
};

test("PREPARE cannot activate text, even in PROTECTED", () => {
  for (const phase of ["LEGACY", "PROTECTED"]) {
    const stage = resolveFeedbackStage({
      ...identity, phase, stage: "PREPARE",
    });
    const grants = expectedFeedbackExecutors(stage);
    assert.deepEqual(grants[feedbackRoutines.phase], [
      feedbackRoles.reader, identity.migrationRole, feedbackRoles.privacy,
    ]);
    assert.deepEqual(grants[feedbackRoutines.projection], [feedbackRoles.reader]);
    assert.deepEqual(grants[feedbackRoutines.staffLocker], [
      feedbackRoles.sessionLocker, identity.runtimeRole,
    ]);
    assert.equal(grants[feedbackRoutines.guestBearer4]?.includes(
      identity.runtimeRole), false);
  }
});

test("test stage is isolated, ordered and never LEGACY", () => {
  assert.throws(() => resolveFeedbackStage({
    ...identity, installed: "P2", stage: "P2_TEST", disposable: false,
  }), /attested disposable/);
  assert.throws(() => resolveFeedbackStage({
    ...identity, installed: "P2", phase: "LEGACY", stage: "P2_TEST",
  }), /PROTECTED/);
  assert.throws(() => resolveFeedbackStage({
    ...identity, installed: "P2", stage: "P5_TEST",
  }), /P5 migration/);
  const p2 = resolveFeedbackStage({
    ...identity, installed: "P2", stage: "P2_TEST",
  });
  const grants = expectedFeedbackExecutors(p2);
  assert.deepEqual(grants[feedbackRoutines.guestBearer4], [
    identity.migrationRole,identity.runtimeRole,
  ]);
  assert.equal(grants[feedbackRoutines.projection], undefined);
  const upgraded=expectedFeedbackExecutors(resolveFeedbackStage({
    ...identity,installed:"P5",stage:"P2_TEST",
  }));
  assert.deepEqual(upgraded[feedbackRoutines.projection],[feedbackRoles.reader]);
  assert.deepEqual(upgraded[feedbackRoutines.staffLocker],[
    feedbackRoles.sessionLocker,identity.runtimeRole,
  ]);
});

test("P5_TEST nested grant only after reader installed; restricted operators", () => {
  const grants = expectedFeedbackExecutors(resolveFeedbackStage({
    ...identity, stage: "P5_TEST",
  }));
  assert.deepEqual(grants[feedbackRoutines.staffLocker], [
    feedbackRoles.sessionLocker, identity.runtimeRole,feedbackRoles.reader,
  ]);
  assert.deepEqual(grants[feedbackRoutines.approveNotice], [
    feedbackRoles.privacy,feedbackRoles.approver,
  ]);
  assert.deepEqual(grants[feedbackRoutines.applyDisposition], [
    feedbackRoles.privacy,feedbackRoles.executor,
  ]);
});

test("production RELEASE is deliberately unavailable without a separate gate", () => {
  assert.throws(() => resolveFeedbackStage({
    ...identity, stage: "RELEASE",
  }), /separate Owner release/);
  assert.throws(() => resolveFeedbackStage({
    ...identity, stage: "P5_TEST", runtimeRole: feedbackRoles.reader,
  }), /distinct/);
});
