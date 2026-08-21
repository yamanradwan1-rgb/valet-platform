import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import { fetchStaffOperationalContext } from "./staff-operational-context-api";
import type {
  StaffOperationalContextControllerOptions,
  StaffOperationalContextState,
} from "./staff-operational-context-types";

export type {
  StaffOperationalContextControllerOptions,
  StaffOperationalContextState,
};

export class StaffOperationalContextController {
  private apiClient: EmployeeApiClient;
  private onStateChange?:
    ((state: StaffOperationalContextState) => void) | undefined;

  private status: "authenticated" | "unauthenticated" | "initializing" =
    "unauthenticated";
  private accessToken: string | null = null;
  private sessionGeneration = 0;

  private sequenceNumber = 0;
  private latestCompletedSeq = 0;
  private activeRequestId: number | null = null;
  private activeAbortController: AbortController | null = null;
  private activeAbortRequestId: number | null = null;
  private isDestroyed = false;

  private state: StaffOperationalContextState = {
    sessionGeneration: null,
    response: null,
    isLoading: false,
    error: null,
  };

  constructor(options: StaffOperationalContextControllerOptions) {
    this.apiClient = options.apiClient;
    this.onStateChange = options.onStateChange;
  }

  public getState(): StaffOperationalContextState {
    return this.state;
  }

  public setApiClient(apiClient: EmployeeApiClient): void {
    this.apiClient = apiClient;
  }

  public setAuth(
    status: "authenticated" | "unauthenticated" | "initializing",
    accessToken: string | null,
    sessionGeneration: number,
  ): void {
    if (this.isDestroyed) return;

    const prevGen = this.sessionGeneration;
    this.status = status;
    this.accessToken = accessToken;
    this.sessionGeneration = sessionGeneration;

    if (status !== "authenticated" || !accessToken) {
      this.clearActiveRequest();
      this.sequenceNumber++;
      this.updateState({
        sessionGeneration: null,
        response: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    // Authenticated transition: if sessionGeneration changed or state is empty, fetch fresh
    if (
      prevGen !== sessionGeneration ||
      this.state.sessionGeneration !== sessionGeneration ||
      this.state.response === null
    ) {
      this.clearActiveRequest();
      this.sequenceNumber++;
      this.updateState({
        sessionGeneration,
        response: null,
        isLoading: true,
        error: null,
      });
      void this.executeFetch(false, sessionGeneration);
    }
  }

  public async refresh(): Promise<void> {
    if (
      this.isDestroyed ||
      this.status !== "authenticated" ||
      !this.accessToken
    ) {
      return;
    }
    await this.executeFetch(false, this.sessionGeneration);
  }

  public async revalidateOnAuthLoss(): Promise<void> {
    if (this.isDestroyed) return;

    this.clearActiveRequest();
    const currentGen = this.sessionGeneration;
    this.sequenceNumber++;

    // Auth loss invalidation: immediately destroy prior stored context
    this.updateState({
      sessionGeneration: currentGen,
      response: null,
      isLoading: this.status === "authenticated",
      error: null,
    });

    if (this.status === "authenticated" && this.accessToken) {
      await this.executeFetch(true, currentGen);
    }
  }

  public handleVisibilityChange(visible: boolean): void {
    if (
      !this.isDestroyed &&
      visible &&
      this.status === "authenticated" &&
      this.accessToken
    ) {
      void this.executeFetch(false, this.sessionGeneration);
    }
  }

  public handleOnline(): void {
    if (
      !this.isDestroyed &&
      this.status === "authenticated" &&
      this.accessToken
    ) {
      void this.executeFetch(false, this.sessionGeneration);
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.clearActiveRequest();
    this.sequenceNumber++;
    this.onStateChange = undefined;
    this.state = {
      sessionGeneration: null,
      response: null,
      isLoading: false,
      error: null,
    };
  }

  private clearActiveRequest(): void {
    this.activeRequestId = null;
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
      this.activeAbortRequestId = null;
    }
  }

  private async executeFetch(
    isAuthLossRevalidation: boolean,
    targetGeneration: number,
  ): Promise<void> {
    if (
      this.isDestroyed ||
      this.status !== "authenticated" ||
      !this.accessToken
    ) {
      return;
    }

    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }
    const requestId = ++this.sequenceNumber;
    this.activeRequestId = requestId;

    const abortController = new AbortController();
    this.activeAbortController = abortController;
    this.activeAbortRequestId = requestId;

    this.updateState({
      sessionGeneration: targetGeneration,
      response: isAuthLossRevalidation ? null : this.state.response,
      isLoading: true,
      error: null,
    });

    try {
      const data = await fetchStaffOperationalContext(this.apiClient, {
        signal: abortController.signal,
      });

      if (
        !this.isDestroyed &&
        !abortController.signal.aborted &&
        requestId === this.sequenceNumber &&
        requestId > this.latestCompletedSeq &&
        this.status === "authenticated" &&
        this.sessionGeneration === targetGeneration
      ) {
        this.latestCompletedSeq = requestId;
        this.updateState({
          sessionGeneration: targetGeneration,
          response: data,
          isLoading: false,
          error: null,
        });
      }
    } catch (err: unknown) {
      if (
        !this.isDestroyed &&
        !abortController.signal.aborted &&
        requestId === this.sequenceNumber &&
        this.status === "authenticated" &&
        this.sessionGeneration === targetGeneration
      ) {
        if (
          err instanceof EmployeeApiError &&
          (err.status === 401 || err.status === 403 || err.status === 404)
        ) {
          this.updateState({
            sessionGeneration: targetGeneration,
            response: null,
            isLoading: false,
            error: err,
          });
        } else if (requestId > this.latestCompletedSeq) {
          this.updateState({
            sessionGeneration: targetGeneration,
            response: this.state.response,
            isLoading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      }
    } finally {
      if (this.activeRequestId === requestId) {
        this.activeRequestId = null;
      }
      if (this.activeAbortRequestId === requestId) {
        this.activeAbortController = null;
        this.activeAbortRequestId = null;
      }
      if (
        !this.isDestroyed &&
        !abortController.signal.aborted &&
        requestId === this.sequenceNumber &&
        this.status === "authenticated" &&
        this.sessionGeneration === targetGeneration
      ) {
        if (this.state.isLoading) {
          this.updateState({
            ...this.state,
            isLoading: false,
          });
        }
      }
    }
  }

  private updateState(nextState: StaffOperationalContextState): void {
    if (this.isDestroyed) return;
    this.state = nextState;
    this.onStateChange?.(this.state);
  }
}
