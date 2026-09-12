import { describe, expect, it } from "vitest";
import { EmployeeRevalidationCoordinator } from "./employee-revalidation-coordinator";

describe("EmployeeRevalidationCoordinator", () => {
  it("coalesces simultaneous foreground, network, and push reasons", async () => {
    const batches: string[][] = [];
    const owner = new EmployeeRevalidationCoordinator(async ({ reasons }) => {
      batches.push([...reasons].sort());
    });
    owner.request("network-recovery");
    owner.setForeground(true);
    owner.request("push-attention");
    await Promise.resolve();
    await owner.whenIdle();
    expect(batches).toEqual([
      ["foreground", "network-recovery", "push-attention"],
    ]);
    owner.setForeground(true);
    await Promise.resolve();
    expect(batches).toHaveLength(1);
  });

  it("holds network recovery while backgrounded and runs once on foreground", async () => {
    let calls = 0;
    const owner = new EmployeeRevalidationCoordinator(async () => {
      calls += 1;
    });
    owner.request("network-recovery");
    await Promise.resolve();
    expect(calls).toBe(0);
    owner.setForeground(true);
    await Promise.resolve();
    await owner.whenIdle();
    expect(calls).toBe(1);
  });

  it("bounds work arriving during a current revalidation to one follow-up", async () => {
    let release!: () => void;
    const batches: string[][] = [];
    const owner = new EmployeeRevalidationCoordinator(async ({ reasons }) => {
      batches.push([...reasons].sort());
      if (batches.length === 1)
        await new Promise<void>((resolve) => (release = resolve));
    });
    owner.setForeground(true);
    await Promise.resolve();
    owner.request("network-recovery");
    owner.request("push-attention");
    release();
    await owner.whenIdle();
    await Promise.resolve();
    await owner.whenIdle();
    expect(batches).toEqual([
      ["foreground"],
      ["network-recovery", "push-attention"],
    ]);
  });

  it("contains a read failure and accepts a later bounded request", async () => {
    let calls = 0;
    const owner = new EmployeeRevalidationCoordinator(async () => {
      calls += 1;
      if (calls === 1) throw new Error("NETWORK_ERROR");
    });
    owner.setForeground(true);
    await Promise.resolve();
    await owner.whenIdle();
    owner.request("network-recovery");
    await Promise.resolve();
    await owner.whenIdle();
    expect(calls).toBe(2);
  });
});
