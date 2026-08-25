/**
 * Pure state machine for backend cursor lists (`{ items, nextCursor }`).
 *
 * Kept free of React so the subtle rules are directly unit-testable:
 * - initial load replaces nothing and fails without destroying prior data
 * - Load More appends rows without duplication and never runs concurrently
 * - `nextCursor === null` means the list is exhausted
 * - a failed page request preserves every already-loaded row plus the exact
 *   cursor needed to safely retry the same page
 */

export type CursorListPhase = "loading" | "ready" | "error";

export interface CursorListSnapshot<Item> {
  readonly items: readonly Item[];
  readonly nextCursor: string | null;
  readonly phase: CursorListPhase;
  readonly loadingMore: boolean;
  readonly moreError: boolean;
}

export interface CursorPage<Item> {
  readonly items: readonly Item[];
  readonly nextCursor: string | null;
}

export function emptyCursorList<Item>(): CursorListSnapshot<Item> {
  return {
    items: [],
    nextCursor: null,
    phase: "loading",
    loadingMore: false,
    moreError: false,
  };
}

/**
 * A Load More request may start only from a successfully loaded list, with a
 * server-issued cursor still available and no page request already running.
 */
export function canLoadMore<Item>(snapshot: CursorListSnapshot<Item>): boolean {
  return (
    snapshot.phase === "ready" &&
    !snapshot.loadingMore &&
    snapshot.nextCursor !== null
  );
}

function mergeUnique<Item>(
  existing: readonly Item[],
  incoming: readonly Item[],
  keyOf: (item: Item) => string,
): readonly Item[] {
  const seen = new Set(existing.map(keyOf));
  const appended: Item[] = [];
  for (const item of incoming) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    appended.push(item);
  }
  return [...existing, ...appended];
}

/** First successful response: becomes the loaded list. */
export function initialPageLoaded<Item>(
  page: CursorPage<Item>,
  keyOf: (item: Item) => string,
): CursorListSnapshot<Item> {
  return {
    items: mergeUnique([], page.items, keyOf),
    nextCursor: page.nextCursor,
    phase: "ready",
    loadingMore: false,
    moreError: false,
  };
}

/** Initial load failure: there is no prior data to preserve. */
export function initialLoadFailed<Item>(): CursorListSnapshot<Item> {
  return { ...emptyCursorList<Item>(), phase: "error" };
}

/** Marks an in-flight Load More; callers must check canLoadMore first. */
export function loadMoreStarted<Item>(
  snapshot: CursorListSnapshot<Item>,
): CursorListSnapshot<Item> {
  if (!canLoadMore(snapshot)) return snapshot;
  return { ...snapshot, loadingMore: true, moreError: false };
}

/**
 * Successful follow-up page: appends unique rows and adopts the new cursor.
 * Exhaustion is sticky: once the server issued `nextCursor: null`, a late
 * page can neither add rows nor resurrect the cursor.
 */
export function pageAppended<Item>(
  snapshot: CursorListSnapshot<Item>,
  page: CursorPage<Item>,
  keyOf: (item: Item) => string,
): CursorListSnapshot<Item> {
  const settled: CursorListSnapshot<Item> = {
    ...snapshot,
    loadingMore: false,
    moreError: false,
  };
  if (snapshot.nextCursor === null) return settled;
  return {
    ...settled,
    items: mergeUnique(snapshot.items, page.items, keyOf),
    nextCursor: page.nextCursor,
  };
}

/**
 * Failed page request: loaded rows and the exact intended cursor survive so a
 * retry re-requests the same page instead of skipping it.
 */
export function loadMoreFailed<Item>(
  snapshot: CursorListSnapshot<Item>,
): CursorListSnapshot<Item> {
  return { ...snapshot, loadingMore: false, moreError: true };
}
