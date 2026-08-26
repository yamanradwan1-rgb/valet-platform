import { describe, expect, it } from "vitest";

import {
  AUTH_MUTATION_LOCK_NAME,
  runInAuthMutationLock,
  type WebLockManagerLike,
} from "./cross-tab-session";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Serializes callbacks exactly like navigator.locks.request does. */
class FakeLockManager implements WebLockManagerLike {
  readonly heldNames: string[] = [];
  private tail: Promise<unknown> = Promise.resolve();

  request<T>(name: string, callback: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      this.heldNames.push(name);
      return callback();
    };
    const result = this.tail.then(run, run);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

describe("runInAuthMutationLock", () => {
  it("runs directly when the Web Locks API is unavailable", async () => {
    let ran = false;
    await expect(
      runInAuthMutationLock(async () => {
        ran = true;
        return "value";
      }, null),
    ).resolves.toBe("value");
    expect(ran).toBe(true);
  });

  it("executes refresh/login/logout mutations under one browser-wide lock", async () => {
    const lockManager = new FakeLockManager();
    await expect(
      runInAuthMutationLock(async () => "rotated", lockManager),
    ).resolves.toBe("rotated");
    expect(lockManager.heldNames).toEqual([AUTH_MUTATION_LOCK_NAME]);
    // DEC-023 coordination lock: shared cookie mutations never interleave.
    expect(AUTH_MUTATION_LOCK_NAME).toBe("vaylet.staff.auth.v1");
  });

  it("serializes concurrent refresh/login/logout mutations safely", async () => {
    const lockManager = new FakeLockManager();
    let active = 0;
    let maxConcurrent = 0;

    const mutate = (label: string): Promise<string> =>
      runInAuthMutationLock(async () => {
        active += 1;
        maxConcurrent = Math.max(maxConcurrent, active);
        await flush();
        active -= 1;
        return label;
      }, lockManager);

    const [first, second] = await Promise.all([
      mutate("one"),
      mutate("two"),
    ]);
    expect(first).toBe("one");
    expect(second).toBe("two");
    expect(maxConcurrent).toBe(1);
    expect(lockManager.heldNames).toHaveLength(2);
  });

  it("propagates mutation failures while releasing the lock", async () => {
    const lockManager = new FakeLockManager();
    await expect(
      runInAuthMutationLock(async () => {
        throw new Error("refresh failed");
      }, lockManager),
    ).rejects.toThrow("refresh failed");

    await expect(
      runInAuthMutationLock(async () => "recovers", lockManager),
    ).resolves.toBe("recovers");
    expect(lockManager.heldNames).toEqual([
      AUTH_MUTATION_LOCK_NAME,
      AUTH_MUTATION_LOCK_NAME,
    ]);
  });
});
