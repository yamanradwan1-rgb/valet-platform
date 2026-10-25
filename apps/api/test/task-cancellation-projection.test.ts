import { describe, expect, it } from "vitest";
import {
  taskCancellationProjection,
  type CancellationEvidence,
} from "../src/modules/dashboard/task-cancellation-projection";

const recorded: CancellationEvidence = {
  count: 1,
  actorId: "11111111-1111-4111-8111-111111111111",
  firstName: "Synthetic",
  lastName: "Worker",
  guest: false,
  occurredAt: "2026-10-25T09:00:00Z",
};
describe("#341 conservative cancellation provenance", () => {
  it("does not attach cancellation facts to a noncancelled task", () => {
    expect(taskCancellationProjection(null)).toBeNull();
  });
  it.each([0, 2])(
    "keeps absent/ambiguous event cardinality %s unknown",
    (count) => {
      expect(taskCancellationProjection({ ...recorded, count })).toEqual({
        kind: "UNKNOWN",
        displayName: null,
        occurredAt: null,
      });
    },
  );
  it("keeps incomplete historical staff identity unknown and never substitutes an email or UUID", () => {
    expect(
      taskCancellationProjection({ ...recorded, lastName: null }),
    ).toMatchObject({ kind: "STAFF", displayName: null });
  });
  it("recognizes Guest only from independent recorded Guest provenance", () => {
    expect(
      taskCancellationProjection({ ...recorded, actorId: null }),
    ).toMatchObject({ kind: "UNKNOWN", displayName: null });
    expect(
      taskCancellationProjection({ ...recorded, actorId: null, guest: true }),
    ).toMatchObject({ kind: "GUEST", displayName: null });
  });
});
