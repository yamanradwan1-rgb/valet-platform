import { describe, expect, it, vi } from "vitest";
import {
  EmployeeConnectivityOwner,
  shouldAttemptEmployeeConnectivityRecovery,
  type EmployeeConnectivityStatus,
} from "./employee-connectivity-owner";

function fixture(initial: EmployeeConnectivityStatus | Error) {
  let listener: ((status: EmployeeConnectivityStatus) => void) | undefined;
  const dispose = vi.fn();
  return {
    dispose,
    emit: (status: EmployeeConnectivityStatus) => listener?.(status),
    owner: new EmployeeConnectivityOwner({
      read: () =>
        initial instanceof Error
          ? Promise.reject(initial)
          : Promise.resolve(initial),
      subscribe: (next) => {
        listener = next;
        return dispose;
      },
    }),
  };
}

describe("EmployeeConnectivityOwner", () => {
  it.each([
    ["offline", "unknown", true],
    ["offline", "online", true],
    ["unknown", "online", true],
    ["online", "unknown", false],
    ["online", "offline", false],
    ["unknown", "unknown", false],
  ] as const)(
    "classifies %s -> %s recovery as %s",
    (previous, current, expected) => {
      expect(shouldAttemptEmployeeConnectivityRecovery(previous, current)).toBe(
        expected,
      );
    },
  );

  it.each(["online", "offline", "unknown"] as const)(
    "publishes the initial %s hint",
    async (status) => {
      const { owner } = fixture(status);
      owner.start();
      await Promise.resolve();
      expect(owner.current()).toBe(status);
    },
  );

  it("publishes transitions once and treats connected-type changes as online", async () => {
    const { emit, owner } = fixture("offline");
    const seen: EmployeeConnectivityStatus[] = [];
    owner.subscribe((status) => seen.push(status));
    owner.start();
    await Promise.resolve();
    emit("online");
    emit("online");
    emit("offline");
    expect(seen).toEqual(["unknown", "offline", "online", "offline"]);
  });

  it("lets a subscribed event win over a stale initial read", async () => {
    let resolveRead!: (value: EmployeeConnectivityStatus) => void;
    let listener!: (status: EmployeeConnectivityStatus) => void;
    const owner = new EmployeeConnectivityOwner({
      read: () => new Promise((resolve) => (resolveRead = resolve)),
      subscribe: (next) => {
        listener = next;
        return () => undefined;
      },
    });
    owner.start();
    listener("online");
    resolveRead("offline");
    await Promise.resolve();
    expect(owner.current()).toBe("online");
  });

  it("falls back to unknown on adapter failure and disposes subscription", async () => {
    const { dispose, emit, owner } = fixture(new Error("adapter unavailable"));
    owner.start();
    await Promise.resolve();
    expect(owner.current()).toBe("unknown");
    owner.dispose();
    emit("online");
    expect(dispose).toHaveBeenCalledOnce();
    expect(owner.current()).toBe("unknown");
  });

  it("stays unknown when the subscribed source cannot be established", async () => {
    const read = vi.fn(async () => "online" as const);
    const owner = new EmployeeConnectivityOwner({
      read,
      subscribe: () => {
        throw new Error("subscription unavailable");
      },
    });
    owner.start();
    await Promise.resolve();
    expect(owner.current()).toBe("unknown");
    expect(read).not.toHaveBeenCalled();
  });
});
