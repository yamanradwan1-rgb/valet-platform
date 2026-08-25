import type { StartShiftResponse } from "@valet/contracts";

import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import { startShiftSession } from "./start-api";

export type StartShiftPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | {
      kind: "error";
      code: string | null;
      message: string;
      locationConflict: boolean;
    }
  | {
      /**
       * DEC-063/DEC-066 truthful recovery: transport failed, so the server
       * may or may not have created the Shift. Only the minimum transient
       * in-memory SAME-command retry intent is retained while mounted.
       */
      kind: "uncertain";
      targetLocationId: string;
    }
  | { kind: "started"; result: StartShiftResponse };

export interface StartShiftControllerOptions {
  readonly apiClient: import("../../lib/api/employee-api-client").EmployeeApiClient;
  readonly onStarted?: ((result: StartShiftResponse) => void) | undefined;
  readonly onStateChange?: ((phase: StartShiftPhase) => void) | undefined;
}

function isAmbiguousOutcome(error: unknown): boolean {
  return error instanceof EmployeeApiError && error.isNetworkError === true;
}

/**
 * Headless Start Shift mutation controller. No persistence of any kind; the
 * uncertain retry intent lives only in this in-memory instance.
 */
export class StartShiftController {
  private apiClient: StartShiftControllerOptions["apiClient"];
  private onStarted?: ((result: StartShiftResponse) => void) | undefined;
  private onStateChange?: ((phase: StartShiftPhase) => void) | undefined;

  private phase: StartShiftPhase = { kind: "idle" };

  constructor(options: StartShiftControllerOptions) {
    this.apiClient = options.apiClient;
    this.onStarted = options.onStarted;
    this.onStateChange = options.onStateChange;
  }

  getPhase(): StartShiftPhase {
    return this.phase;
  }

  activate(onStateChange: (phase: StartShiftPhase) => void): void {
    this.onStateChange = onStateChange;
    onStateChange(this.phase);
  }

  setApiClient(apiClient: StartShiftControllerOptions["apiClient"]): void {
    this.apiClient = apiClient;
  }

  setOnStarted(
    onStarted: ((result: StartShiftResponse) => void) | undefined,
  ): void {
    this.onStarted = onStarted;
  }

  reset(): void {
    this.phase = { kind: "idle" };
    this.onStateChange?.(this.phase);
  }

  submit(targetLocationId: string): void {
    if (this.phase.kind === "submitting") return;
    if (this.phase.kind === "uncertain") {
      // Divergent retry is refused while the original outcome is unknown.
      if (targetLocationId !== this.phase.targetLocationId) return;
    }
    this.setPhase({ kind: "submitting" });
    void startShiftSession(this.apiClient, targetLocationId).then(
      (result) => {
        this.setPhase({ kind: "started", result });
        this.onStarted?.(result);
      },
      (error: unknown) => {
        if (isAmbiguousOutcome(error)) {
          this.setPhase({ kind: "uncertain", targetLocationId });
          return;
        }
        const apiCode =
          error instanceof EmployeeApiError ? error.code : null;
        const message =
          error instanceof Error ? error.message : "Start Shift failed.";
        this.setPhase({
          code: apiCode,
          kind: "error",
          locationConflict: apiCode === "ACTIVE_SHIFT_CONFLICT",
          message,
        });
      },
    );
  }

  /** Explicit retry of the SAME retained command. */
  retry(): void {
    if (this.phase.kind !== "uncertain") return;
    this.submit(this.phase.targetLocationId);
  }

  private setPhase(phase: StartShiftPhase): void {
    this.phase = phase;
    this.onStateChange?.(phase);
  }
}
