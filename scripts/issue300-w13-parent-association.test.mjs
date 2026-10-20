import assert from "node:assert/strict";
import { test } from "node:test";
import { assertLateTaskAssociation } from "./issue300-w13-verifier.mjs";

const auditId = "00000000-0000-4000-8000-000000000001";
const session = "00000000-0000-4000-8000-000000000002";
const key = `AUDIT:${auditId}`;
const lane = {
  kind: "TASK_PARENT",
  outcome: "commit",
  session,
  preexistingIndirectAuditIds: [auditId],
  expected: { s1: { qualityByKey: { [key]: "PARTIAL" } } },
};
const old = { ids: [], all: [] };
const event = {
  key: { source: "AUDIT", eventId: auditId },
  quality: "PARTIAL",
  references: [{ kind: "SESSION", id: session }],
};

test("late Task link admits only signed exact Audit with certified Session", () => {
  assert.doesNotThrow(() =>
    assertLateTaskAssociation(lane, old, { ids: [key], all: [event] }),
  );
  assert.throws(
    () => assertLateTaskAssociation(lane, old, { ids: [], all: [] }),
    /no exact/,
  );
  assert.throws(
    () =>
      assertLateTaskAssociation(
        lane,
        { ids: [key] },
        { ids: [key], all: [event] },
      ),
    /Old signed S0/,
  );
  assert.throws(
    () =>
      assertLateTaskAssociation(lane, old, {
        ids: [key],
        all: [{ ...event, references: [{ kind: "SESSION", id: auditId }] }],
      }),
    /certified Session/,
  );
  assert.throws(
    () =>
      assertLateTaskAssociation(lane, old, {
        ids: [key],
        all: [{ ...event, quality: "RECORDED" }],
      }),
    /confidence/,
  );
});
