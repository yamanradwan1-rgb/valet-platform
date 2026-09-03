import { describe, expect, it } from "vitest";

import { NativeIdentityStateBoundary } from "../src/auth/identity-state-boundary";

describe("native identity-scoped state boundary", () => {
  it("attempts every purge handler before rejecting the first failure", async () => {
    const boundary = new NativeIdentityStateBoundary();
    const calls: number[] = [];
    boundary.register(() => {
      calls.push(1);
      throw new Error("first purge failed");
    });
    boundary.register(async () => {
      await Promise.resolve();
      calls.push(2);
      throw new Error("second purge failed");
    });
    boundary.register(() => {
      calls.push(3);
    });

    await expect(boundary.purge()).rejects.toThrow("first purge failed");
    expect(calls).toEqual([1, 2, 3]);
  });
});
