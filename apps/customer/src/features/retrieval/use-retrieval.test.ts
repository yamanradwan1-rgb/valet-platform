import { describe, expect, it, vi } from 'vitest';

import { createInFlightLock } from '../../lib/async/in-flight-guard';

describe('Production in-flight locking guard (createInFlightLock)', () => {
  it('ensures two synchronous concurrent calls execute the guarded mutation exactly once', async () => {
    const lock = createInFlightLock();
    let mutationCount = 0;

    const guardedMutation = vi.fn().mockImplementation(async () => {
      mutationCount++;
      // Simulate network roundtrip
      await new Promise((resolve) => setTimeout(resolve, 40));
      return { success: true, count: mutationCount };
    });

    // Launch two calls concurrently without awaiting the first
    const [result1, result2] = await Promise.all([
      lock.runGuarded(guardedMutation),
      lock.runGuarded(guardedMutation),
    ]);

    // The first call successfully executes and returns the result
    expect(result1).toEqual({ success: true, count: 1 });

    // The second concurrent call is synchronously rejected by the lock and returns null
    expect(result2).toBeNull();

    // The underlying mutation function was called exactly once
    expect(mutationCount).toBe(1);
    expect(guardedMutation).toHaveBeenCalledTimes(1);

    // After the in-flight operation completes, the lock is released
    expect(lock.isLocked()).toBe(false);

    // A subsequent call can now execute normally
    const result3 = await lock.runGuarded(guardedMutation);
    expect(result3).toEqual({ success: true, count: 2 });
    expect(mutationCount).toBe(2);
    expect(guardedMutation).toHaveBeenCalledTimes(2);
  });

  it('releases lock safely even when the guarded mutation throws an error', async () => {
    const lock = createInFlightLock();

    const failingMutation = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw new Error('Network timeout');
    });

    await expect(lock.runGuarded(failingMutation)).rejects.toThrow('Network timeout');

    // Lock is properly released in finally block
    expect(lock.isLocked()).toBe(false);

    // Subsequent operation can proceed
    const nextMutation = vi.fn().mockResolvedValue('ok');
    const result = await lock.runGuarded(nextMutation);
    expect(result).toBe('ok');
    expect(nextMutation).toHaveBeenCalledTimes(1);
  });
});
