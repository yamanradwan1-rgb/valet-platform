/**
 * A bounded, cancellation-aware queue for the current authenticated gallery.
 * It never prefetches outside the caller's active visit, retries, caches,
 * or publishes an incomplete result. Server admission remains authoritative.
 */
export async function acquireSessionPhotosInOrder<T, Result>(
  items: readonly T[],
  read: (item: T, index: number, signal: AbortSignal) => Promise<Result>,
  parentSignal: AbortSignal,
): Promise<Result[]> {
  if (parentSignal.aborted) {
    throw parentSignal.reason ?? new DOMException("Aborted", "AbortError");
  }
  if (items.length === 0) return [];

  // Two is the existing per-user API delivery ceiling, not a configurable
  // client-side permission or a reason to loosen server rate limits.
  const workerCount = Math.min(2, items.length);
  const batch = new AbortController();
  const abortForScope = () => batch.abort(parentSignal.reason);
  parentSignal.addEventListener("abort", abortForScope, { once: true });
  if (parentSignal.aborted) abortForScope();

  const ordered = new Array<Result>(items.length);
  let nextIndex = 0;
  let failed = false;
  let failure: unknown;

  const worker = async () => {
    while (!batch.signal.aborted) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        const result = await read(items[index]!, index, batch.signal);
        if (batch.signal.aborted) return;
        ordered[index] = result;
      } catch (error: unknown) {
        if (!failed) {
          failed = true;
          failure = error;
          batch.abort();
        }
        return;
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    if (parentSignal.aborted) {
      throw parentSignal.reason ?? new DOMException("Aborted", "AbortError");
    }
    if (failed) throw failure;
    return ordered;
  } finally {
    parentSignal.removeEventListener("abort", abortForScope);
  }
}
