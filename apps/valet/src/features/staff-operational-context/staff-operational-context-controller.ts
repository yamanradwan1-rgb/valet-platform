import type { StaffOperationalContextResponse } from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import { fetchStaffOperationalContext } from "./staff-operational-context-api";

export interface StaffOperationalContextState {
  readonly response: StaffOperationalContextResponse | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
}

export interface StaffOperationalContextControllerOptions {
  readonly apiClient: EmployeeApiClient;
  readonly onStateChange?:
    ((state: StaffOperationalContextState) => void) | undefined;
}

export class StaffOperationalContextController {
  private apiClient: EmployeeApiClient;
  private onStateChange?:
    ((state: StaffOperationalContextState) => void) | undefined;

  private status: "authenticated" | "unauthenticated" | "initializing" =
    "unauthenticated";
  private accessToken: string | null = null;

  private sequenceNumber = 0;
  private latestCompletedSeq = 0;
  private activeAbortController: AbortController | null = null;

  private state: StaffOperationalContextState = {
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
  ): void {
    const prevStatus = this.status;
    const prevToken = this.accessToken;

    this.status = status;
    this.accessToken = accessToken;

    if (status !== "authenticated" || !accessToken) {
      if (this.activeAbortController) {
        this.activeAbortController.abort();
        this.activeAbortController = null;
      }
      this.sequenceNumber++;
      this.updateState({
        response: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    // Authenticated transition: if token changed or response was destroyed, start fresh with null
    if (
      prevStatus !== "authenticated" ||
      prevToken !== accessToken ||
      this.state.response === null
    ) {
      this.sequenceNumber++;
      this.updateState({
        response: null,
        isLoading: true,
        error: null,
      });
      void this.executeFetch(false);
    }
  }

  public async refresh(): Promise<void> {
    if (this.status !== "authenticated" || !this.accessToken) {
      return;
    }
    await this.executeFetch(false);
  }

  public async revalidateOnAuthLoss(): Promise<void> {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    this.sequenceNumber++;

    // Auth loss invalidation: immediately destroy prior stored context
    this.updateState({
      response: null,
      isLoading: this.status === "authenticated",
      error: null,
    });

    if (this.status === "authenticated" && this.accessToken) {
      await this.executeFetch(true);
    }
  }

  public handleVisibilityChange(visible: boolean): void {
    if (visible && this.status === "authenticated" && this.accessToken) {
      void this.executeFetch(false);
    }
  }

  public handleOnline(): void {
    if (this.status === "authenticated" && this.accessToken) {
      void this.executeFetch(false);
    }
  }

  public destroy(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    this.sequenceNumber++;
    this.onStateChange = undefined;
    this.updateState({
      response: null,
      isLoading: false,
      error: null,
    });
  }

  private async executeFetch(isAuthLossRevalidation: boolean): Promise<void> {
    if (this.status !== "authenticated" || !this.accessToken) {
      return;
    }

    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }
    const abortController = new AbortController();
    this.activeAbortController = abortController;

    const currentSeq = ++this.sequenceNumber;
    const currentToken = this.accessToken;

    this.updateState({
      response: isAuthLossRevalidation ? null : this.state.response,
      isLoading: true,
      error: null,
    });

    try {
      const data = await fetchStaffOperationalContext(this.apiClient, {
        signal: abortController.signal,
      });

      if (
        !abortController.signal.aborted &&
        currentSeq === this.sequenceNumber &&
        currentSeq > this.latestCompletedSeq &&
        this.status === "authenticated" &&
        this.accessToken === currentToken
      ) {
        this.latestCompletedSeq = currentSeq;
        this.updateState({
          response: data,
          isLoading: false,
          error: null,
        });
      }
    } catch (err: unknown) {
      if (
        !abortController.signal.aborted &&
        currentSeq === this.sequenceNumber &&
        this.status === "authenticated"
      ) {
        if (
          err instanceof EmployeeApiError &&
          (err.status === 401 || err.status === 403 || err.status === 404)
        ) {
          this.updateState({
            response: null,
            isLoading: false,
            error: err,
          });
        } else if (currentSeq > this.latestCompletedSeq) {
          this.updateState({
            response: this.state.response,
            isLoading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      }
    } finally {
      if (
        !abortController.signal.aborted &&
        currentSeq === this.sequenceNumber &&
        this.status === "authenticated"
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
    this.state = nextState;
    this.onStateChange?.(this.state);
  }
}
