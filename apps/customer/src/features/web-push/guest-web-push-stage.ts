const OPERATION_DEADLINE_MS = 30_000;

export class GuestWebPushTimeoutError extends Error {
  override readonly name = "GuestWebPushTimeoutError";

  constructor(stage: string) {
    super(`Guest Web Push ${stage} timed out.`);
  }
}

export function guestWebPushAbortError(): DOMException {
  return new DOMException("Guest Web Push operation cancelled.", "AbortError");
}

/**
 * Browser permission/PushManager promises may ignore AbortSignal forever.
 * Settle our caller and release listeners on time, and observe late outcomes
 * without letting those native promises continue the old operation.
 */
export function boundedGuestWebPushStage<T>(
  stage: string,
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  ownerSignal?: AbortSignal,
): Promise<T> {
  if (ownerSignal?.aborted) return Promise.reject(guestWebPushAbortError());

  return new Promise<T>((resolve, reject) => {
    const stageController = new AbortController();
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      ownerSignal?.removeEventListener("abort", onAbort);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      stageController.abort();
      cleanup();
      reject(error);
    };
    const onAbort = () => fail(guestWebPushAbortError());
    ownerSignal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(
      () => fail(new GuestWebPushTimeoutError(stage)),
      timeoutMs,
    );

    if (ownerSignal?.aborted) {
      onAbort();
      return;
    }

    try {
      // Invoke synchronously: requestPermission must keep the original gesture.
      Promise.resolve(work(stageController.signal)).then(
        (value) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        },
      );
    } catch (error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }
  });
}

export function guestWebPushStages(ownerSignal?: AbortSignal) {
  const deadline = Date.now() + OPERATION_DEADLINE_MS;
  return <T>(
    stage: string,
    timeoutMs: number,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    if (ownerSignal?.aborted) return Promise.reject(guestWebPushAbortError());
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0)
      return Promise.reject(new GuestWebPushTimeoutError("operation"));
    return boundedGuestWebPushStage(
      stage,
      work,
      Math.min(remainingMs, timeoutMs),
      ownerSignal,
    );
  };
}
