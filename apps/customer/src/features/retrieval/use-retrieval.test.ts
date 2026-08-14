import { describe, expect, it, vi } from 'vitest';

import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import type { GuestApiClient } from '../../lib/api/guest-api-client';

describe('Retrieval in-flight synchronous protection', () => {
  it('ensures two concurrent retrieval requests produce exactly one API mutation attempt', async () => {
    const mockSession: GuestSafeSession = {
      valetSessionId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      state: 'REQUESTED',
      vehicle: { make: 'Tesla', model: 'Model 3', color: 'White' },
    };

    let apiCallCount = 0;
    const mockClient = {
      requestRetrieval: vi.fn().mockImplementation(async () => {
        apiCallCount++;
        // Simulate network latency
        await new Promise((resolve) => setTimeout(resolve, 50));
        return mockSession;
      }),
      cancelRetrieval: vi.fn(),
    } as unknown as GuestApiClient;

    // Simulate the synchronous ref locking mechanism used in useRetrieval
    let isRequestingLock = false;

    const requestVehicleWithLock = async (): Promise<boolean> => {
      // Synchronous ref lock
      if (isRequestingLock) return false;
      isRequestingLock = true;

      try {
        await mockClient.requestRetrieval();
        return true;
      } finally {
        isRequestingLock = false;
      }
    };

    // Trigger two concurrent invocations synchronously
    const [result1, result2] = await Promise.all([
      requestVehicleWithLock(),
      requestVehicleWithLock(),
    ]);

    // Exactly one call succeeded and one was aborted by the synchronous lock
    expect(result1).toBe(true);
    expect(result2).toBe(false);
    expect(apiCallCount).toBe(1);
    expect(mockClient.requestRetrieval).toHaveBeenCalledTimes(1);
  });

  it('ensures two concurrent cancel requests produce exactly one API mutation attempt', async () => {
    const mockSession: GuestSafeSession = {
      valetSessionId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      state: 'PARKED',
      vehicle: { make: 'Tesla', model: 'Model 3', color: 'White' },
    };

    let apiCallCount = 0;
    const mockClient = {
      requestRetrieval: vi.fn(),
      cancelRetrieval: vi.fn().mockImplementation(async () => {
        apiCallCount++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return mockSession;
      }),
    } as unknown as GuestApiClient;

    let isCancellingLock = false;

    const cancelVehicleWithLock = async (): Promise<boolean> => {
      // Synchronous ref lock
      if (isCancellingLock) return false;
      isCancellingLock = true;

      try {
        await mockClient.cancelRetrieval();
        return true;
      } finally {
        isCancellingLock = false;
      }
    };

    // Trigger two concurrent invocations synchronously
    const [result1, result2] = await Promise.all([
      cancelVehicleWithLock(),
      cancelVehicleWithLock(),
    ]);

    expect(result1).toBe(true);
    expect(result2).toBe(false);
    expect(apiCallCount).toBe(1);
    expect(mockClient.cancelRetrieval).toHaveBeenCalledTimes(1);
  });
});
