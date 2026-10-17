import type {
  AuditInvestigationSearchQuery,
  AuditInvestigationSearchResponse,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../../../lib/api/dashboard-api-client";
import { ScopeGenerationGuard } from "../../../../lib/scope/scope-generation";
import {
  readInvestigationSessions,
  type InvestigationSearchTransport,
} from "./investigation-search-client";
import {
  mapInvestigationSearchPage,
  type InvestigationSearchPage,
} from "./investigation-search-model";
import {
  validateInvestigationSearchQuery,
  changeInvestigationSearchPage,
} from "./investigation-search-query";
import {
  investigationSearchScopeKey,
  validateInvestigationSearchScope,
  type InvestigationSearchScope,
} from "./investigation-search-scope";

export type InvestigationSearchReader = (
  context: InvestigationSearchTransport,
  query: AuditInvestigationSearchQuery,
) => Promise<AuditInvestigationSearchResponse>;

export interface InvestigationSearchState {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly page: InvestigationSearchPage | null;
  readonly error: unknown | null;
  readonly query: AuditInvestigationSearchQuery | null;
  readonly loadingMore: boolean;
}

function idle(): InvestigationSearchState {
  return {
    status: "idle",
    page: null,
    error: null,
    query: null,
    loadingMore: false,
  };
}

/**
 * Isolated nonvisual controller; never bound to the frozen demo presentation.
 *
 * Every change in the exact identity/session/scope revisions or applied
 * filters invalidates cached data, pending network calls, cursor and selection.
 * Unapplied form edits do not cause GETs. Server access is still authorized by
 * W4 for every page; this guard prevents UI cross-scope flashes, not access.
 */
export class InvestigationSearchController {
  private readonly guard = new ScopeGenerationGuard();
  private scope: InvestigationSearchScope | null = null;
  private scopeKey: string | null = null;
  private result: InvestigationSearchState = idle();
  private disposed = false;

  constructor(
    private readonly read: InvestigationSearchReader = readInvestigationSessions,
  ) {}

  snapshot(): InvestigationSearchState {
    return this.result;
  }

  /** Passing null (no exact location/authority) clears all protected data. */
  configure(scope: InvestigationSearchScope | null): void {
    if (this.disposed) return;
    const verified = scope ? validateInvestigationSearchScope(scope) : null;
    const key = verified ? investigationSearchScopeKey(verified) : null;
    if (key === this.scopeKey) return;
    this.guard.invalidate();
    this.scope = verified;
    this.scopeKey = key;
    this.result = idle();
  }

  /** Clear instantly on logout, grant/scope change or auth reconciliation. */
  revoke(): void {
    this.guard.invalidate();
    this.scope = null;
    this.scopeKey = null;
    this.result = idle();
  }

  dispose(): void {
    this.revoke();
    this.disposed = true;
  }

  async apply(
    api: Pick<DashboardApiClient, "request">,
    input: unknown,
  ): Promise<boolean> {
    if (!this.scope || this.disposed) return false;
    this.guard.invalidate();
    this.result = idle();
    const parsed = validateInvestigationSearchQuery(input);
    // A new Apply is a fresh search; a caller-supplied cursor cannot bypass it.
    const query = changeInvestigationSearchPage(parsed, null);
    this.result = {
      status: "loading",
      page: null,
      query,
      error: null,
      loadingMore: false,
    };
    return this.execute(api, query, null);
  }

  async next(api: Pick<DashboardApiClient, "request">): Promise<boolean> {
    if (
      this.disposed ||
      !this.scope ||
      this.result.status !== "ready" ||
      !this.result.page?.nextCursor ||
      !this.result.query
    )
      return false;
    const previous = this.result.page;
    const query = changeInvestigationSearchPage(
      this.result.query,
      previous.nextCursor,
    );
    this.result = {
      ...this.result,
      status: "loading",
      loadingMore: true,
      error: null,
    };
    return this.execute(api, query, previous);
  }

  private async execute(
    api: Pick<DashboardApiClient, "request">,
    query: AuditInvestigationSearchQuery,
    previous: InvestigationSearchPage | null,
  ): Promise<boolean> {
    if (!this.scope || this.disposed) return false;
    const contextScope = this.scope;
    const version = this.scopeKey;
    const ticket = this.guard.begin();
    const context: InvestigationSearchTransport = {
      api,
      scope: contextScope,
      signal: ticket.signal,
      onAuthReconciled: () => this.revoke(),
    };
    try {
      const response = await this.read(context, query);
      if (
        !this.guard.isCurrent(ticket) ||
        version !== this.scopeKey ||
        this.disposed
      )
        return false;
      const page = mapInvestigationSearchPage(response);
      // Current vehicle identity is live, not a snapshot. Reject a detectable
      // mismatch instead of showing a result inconsistent with applied filters.
      const vehicleMismatch = page.items.some(
        ({ currentVehicle }) =>
          (query.make &&
            !currentVehicle.make.value
              ?.toLowerCase()
              .includes(query.make.toLowerCase())) ||
          (query.model &&
            !currentVehicle.model.value
              ?.toLowerCase()
              .includes(query.model.toLowerCase())) ||
          (query.plate &&
            !currentVehicle.plate.value
              ?.toUpperCase()
              .includes(query.plate.toUpperCase())) ||
          (query.plateCountry &&
            currentVehicle.plateCountry.value?.toUpperCase() !==
              query.plateCountry),
      );
      if (vehicleMismatch) {
        throw new Error(
          "Current vehicle filters changed during investigation search; restart",
        );
      }
      if (previous) {
        if (
          previous.snapshotAt !== page.snapshotAt ||
          previous.semanticsVersion !== page.semanticsVersion ||
          page.items.some((item) =>
            previous.items.some(
              (existing) => existing.sessionId === item.sessionId,
            ),
          )
        ) {
          throw new Error(
            "Investigation search continuation is inconsistent; restart search",
          );
        }
      }
      this.result = {
        status: "ready",
        query: changeInvestigationSearchPage(query, null),
        page: previous
          ? { ...page, items: [...previous.items, ...page.items] }
          : page,
        error: null,
        loadingMore: false,
      };
      return true;
    } catch (error: unknown) {
      if (
        !this.guard.isCurrent(ticket) ||
        version !== this.scopeKey ||
        this.disposed
      )
        return false;
      // Fail closed: never publish partial/old matches on an error.
      this.result = {
        status: "error",
        query: changeInvestigationSearchPage(query, null),
        page: null,
        error,
        loadingMore: false,
      };
      return false;
    }
  }
}
