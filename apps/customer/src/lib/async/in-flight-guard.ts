export interface InFlightLock {
  readonly isLocked: () => boolean;
  readonly runGuarded: <T>(fn: () => Promise<T>) => Promise<T | null>;
}

export function createInFlightLock(): InFlightLock {
  let isRunning = false;

  return {
    isLocked: () => isRunning,
    runGuarded: async <T>(fn: () => Promise<T>): Promise<T | null> => {
      // Synchronous ref-level lock check
      if (isRunning) {
        return null;
      }
      isRunning = true;

      try {
        return await fn();
      } finally {
        isRunning = false;
      }
    },
  };
}
