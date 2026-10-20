import {
  auditInvestigationFilterQuerySchema,
  type AuditInvestigationFilterQuery,
  type AuditInvestigationFilterResponse,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../../../lib/api/dashboard-api-client";
import { ScopeGenerationGuard } from "../../../../lib/scope/scope-generation";
import {
  readInvestigationSearchFilters,
  type InvestigationSearchTransport,
} from "./investigation-search-client";
import {
  mapInvestigationSelectorOptions,
  type CurrentDisplayValue,
} from "./investigation-search-model";
import {
  investigationSearchScopeKey,
  validateInvestigationSearchScope,
  type InvestigationSearchScope,
} from "./investigation-search-scope";

export interface InvestigationSelectorPage {
  readonly kind: "MEMBER" | "KEY_SLOT";
  readonly options: readonly {
    readonly id: string;
    readonly label: CurrentDisplayValue;
  }[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

type SelectorReader = (
  context: InvestigationSearchTransport,
  query: AuditInvestigationFilterQuery,
) => Promise<AuditInvestigationFilterResponse>;

/**
 * A separate request guard avoids one selector response invalidating the
 * search's cursor. Deliberate selection, not free-text current labels, supplies
 * canonical IDs to the W1 search query.
 *
 * Debouncing is controlled by an eventual nonvisual caller; this class never
 * requests automatically or caches another Location's directory.
 */
export class InvestigationSelectorController {
  private readonly guard = new ScopeGenerationGuard();
  private scope: InvestigationSearchScope | null = null;
  private key: string | null = null;
  private disposed = false;
  private page: InvestigationSelectorPage | null = null;

  constructor(
    private readonly reader: SelectorReader = readInvestigationSearchFilters,
  ) {}

  snapshot(): InvestigationSelectorPage | null {
    return this.page;
  }

  configure(scope: InvestigationSearchScope | null): void {
    if (this.disposed) return;
    const valid = scope ? validateInvestigationSearchScope(scope) : null;
    const key = valid ? investigationSearchScopeKey(valid) : null;
    if (key === this.key) return;
    this.revoke();
    this.scope = valid;
    this.key = key;
  }

  revoke(): void {
    this.guard.invalidate();
    this.scope = null;
    this.key = null;
    this.page = null;
  }

  dispose(): void {
    this.revoke();
    this.disposed = true;
  }

  async select(
    api: Pick<DashboardApiClient, "request">,
    input: unknown,
  ): Promise<boolean> {
    if (!this.scope || this.disposed) return false;
    const query = auditInvestigationFilterQuerySchema.parse(input);
    const currentKey = this.key;
    const ticket = this.guard.begin();
    this.page = null;
    try {
      const response = await this.reader(
        {
          api,
          scope: this.scope,
          signal: ticket.signal,
          onAuthReconciled: () => this.revoke(),
        },
        query,
      );
      if (
        !this.guard.isCurrent(ticket) ||
        this.key !== currentKey ||
        this.disposed
      ) {
        return false;
      }
      if (response.kind !== query.kind) {
        throw new Error("Investigation selector kind mismatch");
      }
      this.page = {
        kind: response.kind,
        options: mapInvestigationSelectorOptions(response),
        hasMore: response.hasMore,
        nextCursor: response.nextCursor,
      };
      return true;
    } catch (error: unknown) {
      if (
        !this.guard.isCurrent(ticket) ||
        this.key !== currentKey ||
        this.disposed
      ) {
        return false;
      }
      this.page = null;
      // Readers provide typed API errors; no identity or user text is logged.
      throw error;
    }
  }
}
