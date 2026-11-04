/**
 * Browser-tab transport mutex, not an authorization or response cache.
 * A pending read is removed immediately when its owner aborts; an already
 * dispatched read retains the mutex until it physically settles, even if
 * its AbortSignal is ignored. Never infer backend cancellation from abort.
 */
interface WaitingRead {
  readonly signal: AbortSignal;
  readonly dispatch: () => void;
  readonly cancel: () => void;
}

let occupied = false;
const waiting: WaitingRead[] = [];

function cancelled(): Error {
  return new Error("Management alert read cancelled or authority changed");
}

function dispatchNext(): void {
  if (occupied) return;
  while (waiting.length > 0) {
    const next = waiting.shift()!;
    next.signal.removeEventListener("abort", next.cancel);
    if (next.signal.aborted) {
      next.cancel();
      continue;
    }
    occupied = true;
    next.dispatch();
    return;
  }
}

export function readWithAlertTransportLease<T>(
  signal: AbortSignal,
  currentAuthority: () => boolean,
  read: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const queued: WaitingRead = {
      signal,
      cancel: () => {
        const index = waiting.indexOf(queued);
        if (index !== -1) waiting.splice(index, 1);
        signal.removeEventListener("abort", queued.cancel);
        reject(cancelled());
      },
      dispatch: () => {
        void Promise.resolve()
          .then(() => {
            // Evaluate live identity, session and Location revision immediately
            // before physical fetch, not only at the earlier enqueue decision.
            if (signal.aborted || !currentAuthority()) throw cancelled();
            return read(signal);
          })
          .then(resolve, reject)
          .finally(() => {
            occupied = false;
            dispatchNext();
          });
      },
    };
    if (signal.aborted) {
      reject(cancelled());
      return;
    }
    signal.addEventListener("abort", queued.cancel, { once: true });
    waiting.push(queued);
    dispatchNext();
  });
}
