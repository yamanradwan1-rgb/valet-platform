import { describe, expect, it, vi } from "vitest";

import { retireNativeShiftScope } from "../src/shift/native-shift-retirement";

describe("Native post-End Shift retirement", () => {
  it("clears every stale operational workflow only after invoked by success", () => {
    const clear = () => ({ clear: vi.fn() });
    const targets = {
      checkIn: clear(),
      confirmParking: clear(),
      handoff: clear(),
      operations: clear(),
      parking: clear(),
      release: clear(),
      retrieval: clear(),
      shiftStart: clear(),
    };

    for (const target of Object.values(targets)) {
      expect(target.clear).not.toHaveBeenCalled();
    }
    retireNativeShiftScope(targets);
    for (const target of Object.values(targets)) {
      expect(target.clear).toHaveBeenCalledOnce();
    }
  });
});
