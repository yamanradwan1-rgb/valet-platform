import {
  auditInvestigationFilterQuerySchema,
  auditInvestigationFilterResponseSchema,
  type AuditInvestigationFilterQuery,
  type AuditInvestigationFilterResponse,
} from "@valet/contracts";

import {
  readInvestigationSearchFilters,
  type InvestigationSearchTransport,
} from "./investigation-search-client";
import type { InvestigationSelectorOption } from "./investigation-selector-resolution";
import { investigationSearchScopeKey } from "./investigation-search-scope";

const PAGE_SIZE = 20;
export const MAX_INVESTIGATION_MEMBER_OPTIONS = 200;

export interface MemberOptionsRequest {
  readonly scopeKey: string;
  /** Must compare against CURRENT identity/session/selection/Location, not a captured constant. */
  readonly isScopeCurrent: () => boolean;
  readonly text?: string;
  readonly maxMembers?: number;
}

export type MemberOptionsResult =
  | {
      readonly status: "complete";
      readonly scopeKey: string;
      readonly options: readonly InvestigationSelectorOption[];
    }
  | {
      readonly status: "incomplete";
      readonly scopeKey: string;
      readonly options: readonly [];
      readonly reason: "limit-exceeded" | "server-continuation-unavailable";
    };

export class MemberSelectorStaleError extends Error {
  constructor() {
    super("INVESTIGATION_MEMBER_SELECTOR_STALE_SCOPE");
    this.name = "MemberSelectorStaleError";
  }
}

export class MemberSelectorIntegrityError extends Error {
  constructor() {
    super("INVESTIGATION_MEMBER_SELECTOR_INCONSISTENT_PAGES");
    this.name = "MemberSelectorIntegrityError";
  }
}

export type MemberOptionsReader = (
  context: InvestigationSearchTransport,
  query: AuditInvestigationFilterQuery,
) => Promise<AuditInvestigationFilterResponse>;

/**
 * Fetch a bounded full Member selector, including historical inactive
 * participants. Identity is the membership UUID; duplicate CURRENT names are
 * never merged. No local search over a truncated list.
 *
 * Current 6213fe1d backend returns hasMore=true, nextCursor=null at >20.
 * That is NOT paginatable. Return an explicit incomplete state with ZERO
 * displayable options until backend continuation or an authorized API prefix
 * search interaction is available; never pretend the first page is complete.
 */
export async function loadInvestigationMemberOptions(
  context: InvestigationSearchTransport,
  request: MemberOptionsRequest,
  reader: MemberOptionsReader = readInvestigationSearchFilters,
): Promise<MemberOptionsResult> {
  const max = request.maxMembers ?? MAX_INVESTIGATION_MEMBER_OPTIONS;
  if (
    !Number.isSafeInteger(max) ||
    max < 1 ||
    max > MAX_INVESTIGATION_MEMBER_OPTIONS
  ) {
    throw new RangeError("Invalid bounded investigation membership limit");
  }
  const scopeKey = investigationSearchScopeKey(context.scope);
  if (request.scopeKey !== scopeKey) throw new MemberSelectorStaleError();
  let authReconciled = false;
  const isCurrent = () =>
    !authReconciled && !context.signal.aborted && request.isScopeCurrent();
  const assertCurrent = () => {
    if (!isCurrent()) throw new MemberSelectorStaleError();
  };
  const currentContext: InvestigationSearchTransport = {
    ...context,
    onAuthReconciled: () => {
      authReconciled = true;
      context.onAuthReconciled();
    },
  };
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  const options: InvestigationSelectorOption[] = [];
  let cursor: string | undefined;
  for (;;) {
    assertCurrent();
    const query: AuditInvestigationFilterQuery = {
      kind: "MEMBER",
      limit: Math.min(PAGE_SIZE, max - options.length),
      ...(request.text === undefined ? {} : { text: request.text }),
      ...(cursor === undefined ? {} : { cursor }),
    };
    const page = auditInvestigationFilterResponseSchema.parse(
      await reader(
        currentContext,
        auditInvestigationFilterQuerySchema.parse(query),
      ),
    );
    assertCurrent();
    if (page.kind !== "MEMBER") throw new MemberSelectorIntegrityError();
    if (page.hasMore && page.items.length === 0) {
      throw new MemberSelectorIntegrityError();
    }
    for (const item of page.items) {
      if (seenIds.has(item.id)) throw new MemberSelectorIntegrityError();
      seenIds.add(item.id);
      // A null CURRENT name is not historical attribution. Show the UUID.
      options.push({ id: item.id, label: item.currentLabel.value ?? item.id });
    }
    if (!page.hasMore) {
      if (page.nextCursor !== null) throw new MemberSelectorIntegrityError();
      return { status: "complete", scopeKey, options };
    }
    if (options.length >= max) {
      return {
        status: "incomplete",
        scopeKey,
        options: [],
        reason: "limit-exceeded",
      };
    }
    if (!page.nextCursor) {
      return {
        status: "incomplete",
        scopeKey,
        options: [],
        reason: "server-continuation-unavailable",
      };
    }
    if (seenCursors.has(page.nextCursor))
      throw new MemberSelectorIntegrityError();
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}

/** Server prefix matching is available even when backend cursors are not.
 * A scoped, bounded search of the authoritative directory; incomplete results
 * are never offered as the entire matching membership population.
 */
export function searchInvestigationMembersByPrefix(
  context: InvestigationSearchTransport,
  request: MemberOptionsRequest & { readonly text: string },
  reader?: MemberOptionsReader,
): Promise<MemberOptionsResult> {
  if (!request.text.trim() || request.text.length > 80) {
    throw new RangeError("Member prefix must be between 1 and 80 characters");
  }
  return loadInvestigationMemberOptions(context, request, reader);
}

/** One explicit 20-option read. A null cursor with hasMore is an honest
 * unpaginatable prefix and must never produce a fabricated next page. */
export async function readInvestigationMemberPage(
  context: InvestigationSearchTransport,
  prefix: string,
  cursor: string | null = null,
  reader: MemberOptionsReader = readInvestigationSearchFilters,
) {
  if (!prefix.trim() || prefix.trim().length > 80) {
    throw new RangeError("INVALID_MEMBER_PREFIX");
  }
  const response = auditInvestigationFilterResponseSchema.parse(await reader(context, {
    kind: "MEMBER", text: prefix.trim(), limit: PAGE_SIZE,
    ...(cursor ? { cursor } : {}),
  }));
  if (context.signal.aborted) throw new MemberSelectorStaleError();
  if (response.kind !== "MEMBER" || (response.hasMore && !response.items.length)) {
    throw new MemberSelectorIntegrityError();
  }
  return {
    options: response.items.map((item) => ({
      id: item.id, label: item.currentLabel.value ?? item.id,
    })),
    nextCursor: response.nextCursor,
    hasMore: response.hasMore,
  };
}
